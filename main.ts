// LowBounce Rider — a cbBTC/USDC trading bot for agent-fun/bars-replay/v1.
//
// Idea: on a one-minute bar tape a falling market punishes anyone who stays
// invested, so this bot sits in cash and waits for a very specific shape:
// price has bounced a clear margin off its trailing two-hour low. That shape
// means sellers already capitulated nearby and buyers are demonstrably back.
// The bot then rides the recovery with almost all of its cash, and leaves on
// the first real sign of failure: a hard stop under the entry, or a trailing
// exit once the recovery sags a fixed margin from its peak close.
//
// Risk rules, in order:
//  - one position at most, sized as a fixed fraction (95%) of cash on entry
//  - hard stop-loss of 1.2% from the average entry cost on every trade
//  - trailing exit 0.7% below the highest close seen while holding
//  - a 30-bar cooldown after every exit, so a falling tape is never chased
//  - no martingale, no averaging down, no re-entry while an order is pending
//
// Everything is deterministic: the only inputs are the hello message and the
// batch bars the harness sends. No clock, no randomness, no network, no files.

import { runBars } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Strategy parameters (fractions are plain ratios of prices).
const LOOKBACK_BARS = 120; // trailing window for the reference low
const BOUNCE_TRIGGER = 0.005; // enter once close is +0.5% off that low
const POSITION_FRACTION = 0.95; // share of cash spent on an entry
const STOP_LOSS = 0.012; // exit at -1.2% versus average entry cost
const TRAILING_DROP = 0.007; // exit 0.7% under the peak close while holding
const COOLDOWN_BARS = 30; // flat bars to wait after an exit
const MAX_SLIPPAGE_BPS = 300; // generous cap: fills should not be the filter
const EQUITY_BREAKER = 0.06; // flatten and stop for good at -6% from peak equity
const LAST_ENTRY_SEQ = 1410; // no fresh entries in the final 30 bars of a window

// Rolling history of closes (plain numbers; raw prices fit safely in a double).
const closes: number[] = [];

// Position bookkeeping. The harness reports fills one batch after an order,
// so orders in flight are tracked explicitly and never duplicated.
let pendingSide: string | null = null;
let entryPrice = 0; // average cost per unit, in the same units as a close
let peakClose = 0; // highest close since the current position opened
let cooldown = 0; // bars left to stay flat after an exit
let peakEquity = 0; // highest equity (quote units) seen so far
let halted = false; // latched by the equity circuit breaker

function trailingLow(window: number[]): number {
  let low = window[0];
  for (const v of window) if (v < low) low = v;
  return low;
}

function averageCostPrice(qty: bigint, cost: bigint): number {
  // cost is in quote units (10^-6 USDC) for qty at qty_scale 8 and prices at
  // price_scale 5, so the raw average price is cost * 10^7 / qty.
  if (qty <= 0n) return 0;
  return Number((cost * 10_000_000n) / qty);
}

await runBars({
  onBatch(state, batch) {
    const closeRaw = state.close(SYMBOL);
    if (closeRaw === null) return [];
    const close = Number(closeRaw);
    closes.push(close);
    if (closes.length > LOOKBACK_BARS) closes.shift();

    const held = state.positions.get(SYMBOL);
    const holding = held !== undefined && held.qty > 0n;

    // Resolve an order sent on the previous batch: a buy that filled leaves a
    // position whose cost gives the true entry price; a sell that filled
    // leaves no position and starts the cooldown.
    if (pendingSide === 'buy' && holding && held !== undefined) {
      entryPrice = averageCostPrice(held.qty, held.cost);
      peakClose = close;
      pendingSide = null;
    } else if (pendingSide === 'sell' && !holding) {
      entryPrice = 0;
      peakClose = 0;
      cooldown = COOLDOWN_BARS;
      pendingSide = null;
    } else if (pendingSide !== null) {
      // The order was rejected (no fill): clear the flag and re-decide below
      // from the account as it actually stands.
      pendingSide = null;
      if (holding && held !== undefined && entryPrice === 0) {
        entryPrice = averageCostPrice(held.qty, held.cost);
        peakClose = close;
      }
    }

    if (cooldown > 0) cooldown -= 1;
    if (state.warmingUp) return [];
    if (pendingSide !== null) return [];

    // Equity circuit breaker: track the peak, and on a 6% slide from it,
    // flatten whatever is held and never trade again in this window. A slow
    // bleed is how long-only bots die on a tape like this; the breaker caps
    // the damage far inside the 25% guardrail.
    const equityNow = Number(state.equity);
    if (equityNow > peakEquity) peakEquity = equityNow;
    if (!halted && peakEquity > 0 && equityNow / peakEquity - 1 <= -EQUITY_BREAKER) {
      halted = true;
    }

    if (holding && held !== undefined) {
      if (close > peakClose) peakClose = close;
      const pnl = entryPrice > 0 ? close / entryPrice - 1 : 0;
      const sag = peakClose > 0 ? close / peakClose - 1 : 0;
      if (halted || pnl <= -STOP_LOSS || sag <= -TRAILING_DROP) {
        pendingSide = 'sell';
        return [
          {
            side: 'sell',
            symbol: SYMBOL,
            qty: held.qty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          },
        ];
      }
      return [];
    }

    // Flat: only the bounce shape earns an entry, and never during cooldown,
    // after the breaker latched, or in the window's final half hour (a fresh
    // round trip there pays full costs for minutes of exposure).
    if (halted) return [];
    if (state.seq >= LAST_ENTRY_SEQ) return [];
    if (cooldown > 0) return [];
    if (closes.length < LOOKBACK_BARS) return [];
    const low = trailingLow(closes);
    if (low <= 0) return [];
    if (close / low - 1 < BOUNCE_TRIGGER) return [];

    const notional = (state.cash * 95n) / 100n;
    if (notional < 1_000_000n) return [];
    pendingSide = 'buy';
    return [
      {
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: notional,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      },
    ];
  },
});

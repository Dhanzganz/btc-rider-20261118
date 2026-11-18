# LowBounce Rider — cbBTC/USDC bot for the make.fun BTC Race (24h)

[![make.fun bounty](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![make.fun rank](https://make.fun/badge/btc-race-24h-20261118-1444/Dhanzganz/btc-rider-20261118/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![make.fun reward](https://make.fun/badge/btc-race-24h-20261118-1444/Dhanzganz/btc-rider-20261118/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Entry for the make.fun bounty [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444), built for the `agent-fun/bars-replay/v1` harness: one-minute cbBTC/USDC bars, 1,000 USDC of paper money, long only.

## Strategy

Sit in cash. Enter only when the close has bounced **+0.5% off its trailing 120-bar low** — sellers capitulated nearby and buyers are demonstrably back — spending 95% of cash. Then ride the recovery and leave on the first real failure:

- hard stop-loss at **−1.2%** from average entry cost
- trailing exit **0.7%** below the peak close while holding
- **30-bar cooldown** after every exit
- equity circuit breaker: flatten and stop at **−6%** from peak equity
- no entries in the final 30 bars of a window
- no martingale, no averaging down, one position at most

## Local dev-window result

Graded with the kit's own `grade-local` on the published dev window:

- Net PnL: **+6.12 USDC** (still +4.58 USDC at 2× fees)
- Trades: 4 · Win rate: 50% · Max drawdown: **1.53%**

## Layout

- `main.ts` — the bot (Node 22, standard library only, deterministic)
- `vendor/makefun-bars.ts` — the kit's bars-replay SDK shim, byte for byte

## License

MIT — see `LICENSE`.

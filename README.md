# 21Together

Shared-hand multiplayer blackjack. One table on the TV, everyone plays from their phone.
Everyone gets **the same cards**, and each player decides on their own to **hit, stand or double**.

- **Play:** https://21together.<your-subdomain>.workers.dev
- **API:** https://21together-api.<your-subdomain>.workers.dev

## Party night (Dec 24) checklist

1. Plug the laptop into the TV and open https://21together.<your-subdomain>.workers.dev in Chrome.
2. Click **Host a table**. Press **F** for fullscreen and click once anywhere (this enables sound).
3. Guests scan the QR code on the TV (or type the 4-letter code), pick a name and an avatar, and tap **Take a seat**.
4. Press **Space** (or the **Start the game** button). Rounds run on their own after that.
5. At the end, open **End the night** in the host bar to show the awards and podium.

**Host keyboard shortcuts** (on the TV laptop)

| Key | Action |
|---|---|
| `H` | show/hide host controls |
| `Space` | start / pause / resume |
| `N` | skip the current timer |
| `P` | players: top up chips (+500 / +1000), kick, ban |
| `S` | settings (decks, S17/H17, 3:2 vs 6:5, min/max bet, starting chips, seats, timers) |
| `F` | fullscreen |
| `Esc` | close a panel |

Good to know:
- 12 seats max. Extra people wait "on the rail" and get the next free seat.
- If a phone locks or drops Wi-Fi, opening the page again puts the player back in the same seat with the same chips.
- If the TV page reloads, it stays the host: the host key is saved in that browser.
- Opening `/host/CODE` on a second screen shows a read-only spectator view.
- Players with no chips left: use **Players → Top up everyone broke**.

## How a round works

`Betting (15s) → deal 2 shared cards + dealer → decision steps (10s each) → dealer → payout`

In each decision step, every player who is still in chooses at the same time, and the choices stay hidden until the step ends.
If anyone hits, the **next shared card** is revealed and every hitter takes it. Players who stand stay where they are.
Doubling is allowed on the first decision only. Blackjack pays 3:2 and the dealer stands on soft 17 (both configurable).
Full spec: [docs/GAME_SPEC.md](docs/GAME_SPEC.md).

## Stack

| Part | Tech |
|---|---|
| `packages/engine` | Pure TS rules + room state machine (shoe, shared-hand rounds, payouts, achievements, awards) |
| `packages/protocol` | zod schemas for WebSocket messages |
| `apps/worker` | Cloudflare Worker + `GameRoom` Durable Object (WebSocket Hibernation, alarms for timers) |
| `apps/web` | React 19, Vite, Tailwind v4, Motion. Deployed as Cloudflare static assets (Pages on Workers) |
| Database | Neon Postgres (`21together` project): rounds, hands, all-time player stats |

The deck lives only on the server, so phones never see upcoming cards.

## Development

```bash
npm install
npm test                       # engine unit tests (rules, room state machine, 100k-round sim, fuzz)
npm run dev:worker             # http://localhost:8787  (needs apps/worker/.dev.vars with DATABASE_URL, optional)
npm run dev:web                # http://localhost:5173  (phones on the same Wi-Fi can use http://<laptop-ip>:5173)

node scripts/bots.mjs http://localhost:8787 13 3     # 13 bots play 3 rounds (load test)
node scripts/e2e.mjs http://localhost:5173           # reconnect / kick / not-found checks
node scripts/shots.mjs http://localhost:5173 12 fr   # screenshots of every phase → screenshots/
```

Deploy:

```bash
npm run deploy:worker
npm run deploy:web
cd apps/worker && npm run migrate   # apply SQL migrations to Neon
```

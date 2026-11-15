# 21Together: Game Spec

A shared-hand multiplayer blackjack game. One host screen (TV), up to 12 seated players on their phones, plus a waiting "rail".

## Roles
- **Host**: creates the room on the TV and controls the game (start, pause, resume, skip timer, kick, top up chips, settings, end the night). The host does not play.
- **Player**: scans the QR code and picks a nickname and avatar. They get a seat (or a rail spot when all 12 are taken) and play from their phone.

## Rules (defaults, host-configurable)
| Rule | Default |
|---|---|
| Decks | 6, crypto-secure Fisher–Yates shuffle, reshuffle when 75% of the shoe is dealt |
| Dealer | Stands on soft 17 (S17); peeks for blackjack with an A or 10-value up card |
| Blackjack | Pays 3:2 |
| Double | On the first decision only (2 cards); doubles the bet, takes exactly one card |
| Split / insurance / surrender | Not available (v1) |
| Bets | 10–500, 1,000 starting chips |
| Timers | Betting 15s, decision 10s per step (timeout = STAND) |

## Shared-hand mechanics
1. All players who placed a bet get the **same two cards**. The dealer gets one up card and one hole card.
2. **Peek**: if the dealer has blackjack, the round ends (players' shared blackjack pushes).
   If the shared hand is a blackjack, every player has blackjack: the dealer reveals and the round settles.
3. **Decision steps**: every active player chooses HIT, STAND or DOUBLE at the same time. Choices stay hidden ("locked in") until the step resolves.
   - If at least one player chose HIT or DOUBLE, the **next shared card** is revealed and every hitter/doubler takes it.
   - Doublers stop after that card. Players who stand freeze at their total. Bust (>21) = out. A total of 21 auto-stands.
   - Invariant: a player's hand is always the first `stopAt` cards of the shared row.
4. **Dealer** reveals the hole card and draws to 17 (unless every player busted).
5. **Payout**: win 1:1, blackjack 3:2, push returns the bet, loss loses it.

## Round state machine
```
lobby ──host start──▶ betting ──(all locked | timer)──▶ dealing ──▶ deciding ⇄ drawing ──▶ dealer ──▶ payout ──▶ betting …
                         ▲  no bets: timer restarts                (BJ / dealer BJ skip to dealer)
pause/resume can freeze any timed phase. "end" → ended (awards screen).
```

## Progression
- Live leaderboard, ranked by net profit (chips − buy-ins); chip count is shown too.
- Stats per player: hands, W/L/P, win %, blackjacks, busts, doubles, biggest win, best streak, wagered.
- Hand history: every round's shared cards, dealer hand, and each player's stop point, total, outcome and net.
- Achievements, shown as toasts on the phone and the TV.
- End-of-night awards: Chip Leader, Biggest Win, Blackjack Magnet, Most Reckless, Iron Stander, Hot Hand.

## Persistence
- Live state lives in the Cloudflare Durable Object (one per room), saved after every change.
- Finished rounds and player stats are written to Neon Postgres (players are keyed by a device id, so stats carry across parties).

import { neon } from "@neondatabase/serverless";
import type { RoundCompletePayload } from "@21/engine";
import type { GlobalPlayerStats } from "@21/protocol";

function db(url: string) {
  return neon(url);
}

export async function persistRounds(url: string, roomCode: string, rounds: RoundCompletePayload[]): Promise<void> {
  const sql = db(url);
  for (const r of rounds) {
    const players = r.players.map((p) => ({ device_id: p.deviceId, name: p.name, avatar: p.avatar }));
    const hands = r.summary.results.map((x) => {
      const p = r.players.find((pp) => pp.playerId === x.playerId)!;
      return {
        device_id: p.deviceId,
        name: x.name,
        avatar: x.avatar,
        bet: x.bet,
        stop_at: x.stopAt,
        total: x.total,
        outcome: x.outcome,
        net: x.net,
        doubled: x.doubled,
        decisions: x.decisions.join(","),
        chips_after: p.chips,
      };
    });
    await sql.transaction([
      sql`INSERT INTO rooms (code) VALUES (${roomCode}) ON CONFLICT (code) DO UPDATE SET last_played_at = now()`,
      sql`INSERT INTO players (device_id, name, avatar)
          SELECT device_id, name, avatar FROM jsonb_to_recordset(${JSON.stringify(players)}::jsonb)
            AS x(device_id text, name text, avatar text)
          ON CONFLICT (device_id) DO UPDATE SET name = EXCLUDED.name, avatar = EXCLUDED.avatar, updated_at = now()`,
      sql`WITH r AS (
            INSERT INTO rounds (room_code, round_no, shared, dealer, dealer_total, early, played_at)
            VALUES (${roomCode}, ${r.summary.no}, ${r.summary.shared}, ${r.summary.dealer}, ${r.summary.dealerTotal},
                    ${r.summary.early}, to_timestamp(${r.summary.at} / 1000.0))
            RETURNING id
          )
          INSERT INTO player_hands (round_id, device_id, name, avatar, bet, stop_at, total, outcome, net, doubled, decisions, chips_after)
          SELECT r.id, x.device_id, x.name, x.avatar, x.bet, x.stop_at, x.total, x.outcome, x.net, x.doubled,
                 string_to_array(x.decisions, ','), x.chips_after
          FROM r, jsonb_to_recordset(${JSON.stringify(hands)}::jsonb)
            AS x(device_id text, name text, avatar text, bet int, stop_at int, total int, outcome text, net int,
                 doubled boolean, decisions text, chips_after int)`,
    ]);
  }
}

export async function globalLeaderboard(url: string, limit = 25): Promise<GlobalPlayerStats[]> {
  const sql = db(url);
  const rows = (await sql`SELECT name, avatar, hands, wins, losses, pushes, blackjacks, busts, net, biggest_win, parties
                           FROM player_stats ORDER BY net DESC LIMIT ${limit}`) as Record<string, unknown>[];
  return rows.map(mapStats);
}

export async function playerStats(url: string, deviceId: string): Promise<GlobalPlayerStats | null> {
  const sql = db(url);
  const rows = (await sql`SELECT name, avatar, hands, wins, losses, pushes, blackjacks, busts, net, biggest_win, parties
                           FROM player_stats WHERE device_id = ${deviceId}`) as Record<string, unknown>[];
  return rows[0] ? mapStats(rows[0]) : null;
}

function mapStats(r: Record<string, unknown>): GlobalPlayerStats {
  return {
    name: String(r.name),
    avatar: String(r.avatar),
    hands: Number(r.hands),
    wins: Number(r.wins),
    losses: Number(r.losses),
    pushes: Number(r.pushes),
    blackjacks: Number(r.blackjacks),
    busts: Number(r.busts),
    net: Number(r.net),
    biggestWin: Number(r.biggest_win),
    parties: Number(r.parties),
  };
}

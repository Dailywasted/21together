-- 21Together schema
CREATE TABLE IF NOT EXISTS rooms (
  code            text PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_played_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  device_id   text PRIMARY KEY,
  name        text NOT NULL,
  avatar      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rounds (
  id            bigserial PRIMARY KEY,
  room_code     text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  round_no      int NOT NULL,
  shared        text[] NOT NULL,
  dealer        text[] NOT NULL,
  dealer_total  int NOT NULL,
  early         text,
  played_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rounds_room_idx ON rounds (room_code, round_no DESC);

CREATE TABLE IF NOT EXISTS player_hands (
  round_id     bigint NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  device_id    text NOT NULL REFERENCES players(device_id) ON DELETE CASCADE,
  name         text NOT NULL,
  avatar       text NOT NULL,
  bet          int NOT NULL,
  stop_at      int NOT NULL,
  total        int NOT NULL,
  outcome      text NOT NULL CHECK (outcome IN ('win', 'blackjack', 'push', 'lose')),
  net          int NOT NULL,
  doubled      boolean NOT NULL DEFAULT false,
  decisions    text[] NOT NULL DEFAULT '{}',
  chips_after  int NOT NULL,
  PRIMARY KEY (round_id, device_id)
);
CREATE INDEX IF NOT EXISTS player_hands_device_idx ON player_hands (device_id);

CREATE OR REPLACE VIEW player_stats AS
SELECT
  p.device_id,
  p.name,
  p.avatar,
  count(h.*)                                                        AS hands,
  count(*) FILTER (WHERE h.outcome IN ('win', 'blackjack'))         AS wins,
  count(*) FILTER (WHERE h.outcome = 'lose')                        AS losses,
  count(*) FILTER (WHERE h.outcome = 'push')                        AS pushes,
  count(*) FILTER (WHERE h.outcome = 'blackjack')                   AS blackjacks,
  count(*) FILTER (WHERE h.total > 21)                              AS busts,
  coalesce(sum(h.net), 0)                                           AS net,
  coalesce(max(h.net), 0)                                           AS biggest_win,
  count(DISTINCT r.room_code)                                       AS parties
FROM players p
JOIN player_hands h ON h.device_id = p.device_id
JOIN rounds r ON r.id = h.round_id
GROUP BY p.device_id, p.name, p.avatar;

export const ACHIEVEMENTS = [
  "first_win",
  "blackjack",
  "double_hero",
  "brave_16",
  "iron_nerves",
  "five_card",
  "hot_3",
  "on_fire",
  "high_roller",
  "comeback",
  "double_up",
  "big_win",
] as const;

export type AchievementCode = (typeof ACHIEVEMENTS)[number];

export const ACHIEVEMENT_ICONS: Record<AchievementCode, string> = {
  first_win: "🎯",
  blackjack: "🂡",
  double_hero: "⚡",
  brave_16: "🦁",
  iron_nerves: "🧊",
  five_card: "🖐️",
  hot_3: "🔥",
  on_fire: "☄️",
  high_roller: "💎",
  comeback: "🔄",
  double_up: "📈",
  big_win: "💰",
};

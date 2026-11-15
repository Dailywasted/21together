import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PublicSnapshot, Rules } from "@21/engine";
import type { HostCmd } from "@21/protocol";
import { Avatar } from "../components/ui";
import { useT, useLang, fmt, type TKey } from "../lib/i18n";
import { setSoundEnabled, soundEnabled } from "../lib/sound";
import { LangToggle } from "../components/LangToggle";

type Modal = null | "players" | "settings" | "end";

export function HostControls({ snap, cmd }: { snap: PublicSnapshot; cmd: (c: HostCmd) => void }) {
  const t = useT();
  const [visible, setVisible] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [sound, setSound] = useState(soundEnabled());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poke = () => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 4000);
  };

  useEffect(() => {
    poke();
    const onMove = () => poke();
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "h") setVisible((v) => !v);
      else if (k === " ") {
        e.preventDefault();
        if (snap.phase === "lobby" || snap.phase === "ended") cmd({ c: "start" });
        else cmd({ c: snap.paused ? "resume" : "pause" });
      } else if (k === "n") cmd({ c: "skip" });
      else if (k === "p") setModal("players");
      else if (k === "s") setModal("settings");
      else if (k === "f") toggleFullscreen();
      else if (k === "escape") setModal(null);
      else return;
      poke();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.phase, snap.paused]);

  const started = snap.phase !== "lobby" && snap.phase !== "ended";
  return (
    <>
      <AnimatePresence>
        {(visible || modal) && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="glass absolute left-1/2 top-5 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full p-1.5"
            style={{ marginLeft: -160 }}
          >
            {!started ? (
              <DockBtn onClick={() => cmd({ c: "start" })} primary>
                ▶ {snap.phase === "ended" ? t("newNight") : t("startGame")}
              </DockBtn>
            ) : snap.paused ? (
              <DockBtn onClick={() => cmd({ c: "resume" })} primary>
                ▶ {t("resume")}
              </DockBtn>
            ) : (
              <DockBtn onClick={() => cmd({ c: "pause" })}>⏸ {t("pause")}</DockBtn>
            )}
            {started && <DockBtn onClick={() => cmd({ c: "skip" })}>⏭ {t("skip")}</DockBtn>}
            <DockBtn onClick={() => setModal("players")}>👥 {t("players")}</DockBtn>
            <DockBtn onClick={() => setModal("settings")}>⚙ {t("settings")}</DockBtn>
            <DockBtn
              onClick={() => {
                setSoundEnabled(!sound);
                setSound(!sound);
              }}
            >
              {sound ? "🔊" : "🔇"}
            </DockBtn>
            <DockBtn onClick={toggleFullscreen}>⛶</DockBtn>
            <LangToggle className="mx-1" />
            {started && (
              <DockBtn onClick={() => setModal("end")} danger>
                ■ {t("endNight")}
              </DockBtn>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {!visible && !modal && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-xs text-white/20" style={{ marginLeft: -160 }}>
          {t("hostHelp")}
        </div>
      )}

      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
            onClick={() => setModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              className="glass max-h-[900px] w-[760px] overflow-auto rounded-3xl bg-ink-2/90 p-8"
              onClick={(e) => e.stopPropagation()}
            >
              {modal === "players" && <PlayersPanel snap={snap} cmd={cmd} />}
              {modal === "settings" && <SettingsPanel rules={snap.rules} onSave={(r) => { cmd({ c: "rules", rules: r }); setModal(null); }} />}
              {modal === "end" && (
                <div className="text-center">
                  <div className="text-5xl">🏆</div>
                  <h2 className="mt-4 font-display text-3xl font-bold">{t("confirmEnd")}</h2>
                  <div className="mt-8 flex justify-center gap-3">
                    <button className="btn-press rounded-xl bg-white/10 px-6 py-3 font-bold" onClick={() => setModal(null)}>
                      {t("cancel")}
                    </button>
                    <button
                      className="btn-press rounded-xl bg-gold px-6 py-3 font-bold text-ink"
                      onClick={() => {
                        cmd({ c: "end" });
                        setModal(null);
                      }}
                    >
                      {t("yes")}
                    </button>
                  </div>
                </div>
              )}
              {modal !== "end" && (
                <button className="btn-press mt-6 w-full rounded-xl bg-white/10 py-3 font-bold" onClick={() => setModal(null)}>
                  {t("close")}
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function DockBtn({ children, onClick, primary, danger }: { children: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`btn-press whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${
        primary ? "bg-gold text-ink" : danger ? "text-lose hover:bg-lose/10" : "text-white/85 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  } catch {
    /* not allowed */
  }
}

function PlayersPanel({ snap, cmd }: { snap: PublicSnapshot; cmd: (c: HostCmd) => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-3xl font-bold">{t("players")}</h2>
        <button className="btn-press rounded-xl bg-gold/15 px-4 py-2 text-sm font-bold text-gold" onClick={() => cmd({ c: "topupBroke" })}>
          {t("topUpBroke")}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {snap.players.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            <Avatar emoji={p.avatar} seed={p.id} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">
                {p.name} {!p.connected && <span className="text-xs text-white/40">📵</span>}
              </div>
              <div className="tabular text-sm text-white/50">
                {fmt(p.chips, lang)} · {p.seat !== null ? `#${p.seat + 1}` : t("rail")}
              </div>
            </div>
            <button className="btn-press rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold" onClick={() => cmd({ c: "topup", playerId: p.id, amount: 500 })}>
              +500
            </button>
            <button className="btn-press rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold" onClick={() => cmd({ c: "topup", playerId: p.id, amount: 1000 })}>
              +1000
            </button>
            <button className="btn-press rounded-lg px-3 py-1.5 text-sm font-bold text-lose hover:bg-lose/10" onClick={() => cmd({ c: "kick", playerId: p.id, ban: false })}>
              {t("kick")}
            </button>
            <button className="btn-press rounded-lg px-3 py-1.5 text-sm font-bold text-lose/70 hover:bg-lose/10" onClick={() => cmd({ c: "kick", playerId: p.id, ban: true })}>
              {t("ban")}
            </button>
          </li>
        ))}
        {snap.players.length === 0 && <li className="py-6 text-center text-white/40">{t("waitingPlayers")}</li>}
      </ul>
    </div>
  );
}

const NUM_FIELDS: { key: keyof Rules; label: TKey; min: number; max: number; step?: number }[] = [
  { key: "decks", label: "rule_decks", min: 1, max: 8 },
  { key: "minBet", label: "rule_minBet", min: 1, max: 10000 },
  { key: "maxBet", label: "rule_maxBet", min: 1, max: 100000 },
  { key: "startingChips", label: "rule_start", min: 100, max: 1000000, step: 100 },
  { key: "maxSeats", label: "rule_seats", min: 1, max: 12 },
  { key: "betSeconds", label: "rule_betTime", min: 5, max: 60 },
  { key: "decisionSeconds", label: "rule_decideTime", min: 4, max: 30 },
];

function SettingsPanel({ rules, onSave }: { rules: Rules; onSave: (r: Partial<Rules>) => void }) {
  const t = useT();
  const [draft, setDraft] = useState<Rules>(rules);
  return (
    <div>
      <h2 className="mb-5 font-display text-3xl font-bold">{t("settings")}</h2>
      <div className="grid grid-cols-2 gap-3">
        {NUM_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 rounded-2xl bg-white/5 p-3">
            <span className="text-xs font-bold tracking-wider text-white/50 uppercase">{t(f.label)}</span>
            <input
              type="number"
              min={f.min}
              max={f.max}
              step={f.step ?? 1}
              value={draft[f.key] as number}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
              className="tabular bg-transparent font-display text-2xl font-bold focus:outline-none"
            />
          </label>
        ))}
        <label className="flex items-center justify-between rounded-2xl bg-white/5 p-3">
          <span className="text-sm font-bold">{t("rule_s17")}</span>
          <input
            type="checkbox"
            checked={draft.dealerHitsSoft17}
            onChange={(e) => setDraft({ ...draft, dealerHitsSoft17: e.target.checked })}
            className="h-6 w-6 accent-[#f5c451]"
          />
        </label>
        <label className="flex items-center justify-between rounded-2xl bg-white/5 p-3">
          <span className="text-sm font-bold">{t("rule_bj")}</span>
          <select
            value={draft.blackjackPayout}
            onChange={(e) => setDraft({ ...draft, blackjackPayout: Number(e.target.value) })}
            className="rounded-lg bg-white/10 px-2 py-1 font-bold"
          >
            <option value={1.5}>3:2</option>
            <option value={1.2}>6:5</option>
          </select>
        </label>
      </div>
      <button className="btn-press mt-5 w-full rounded-xl bg-gold py-3 font-bold text-ink" onClick={() => onSave(draft)}>
        {t("save")}
      </button>
    </div>
  );
}

import { AnimatePresence, motion } from "motion/react";
import type { PublicSnapshot } from "@21/engine";
import { Avatar, QR, Logo } from "../components/ui";
import { useT } from "../lib/i18n";
import { joinUrl } from "../lib/api";

export function Lobby({ snap, isHost, onStart }: { snap: PublicSnapshot; isHost: boolean; onStart: () => void }) {
  const t = useT();
  const url = joinUrl(snap.code);
  const shortUrl = url.replace(/^https?:\/\//, "");
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="absolute inset-0 z-20 grid place-items-center bg-ink/70 backdrop-blur-md"
    >
      <div className="flex items-center gap-16">
        <motion.div initial={{ scale: 0.9, rotate: -2 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 120 }}>
          <QR text={url} size={360} />
        </motion.div>
        <div className="flex w-[640px] flex-col">
          <Logo size={34} />
          <h1 className="mt-8 font-display text-[76px] font-bold leading-[0.95]">{t("scanToJoin")}</h1>
          <p className="mt-4 text-2xl text-white/60">
            {t("orGoTo")} <span className="font-semibold text-white">{shortUrl.replace(/\/j\/.*/, "")}</span>
          </p>
          <div className="mt-6 flex items-end gap-4">
            <span className="text-lg font-bold tracking-[0.3em] text-white/50 uppercase">{t("code")}</span>
            <span className="font-display text-[96px] font-bold leading-[0.8] tracking-[0.12em] gold-text">{snap.code}</span>
          </div>
          <div className="mt-10 min-h-[120px]">
            <div className="mb-3 text-sm font-bold tracking-[0.25em] text-white/45 uppercase">
              {snap.players.length ? t("playersJoined", { n: snap.players.length }) : t("waitingPlayers")}
            </div>
            <div className="flex flex-wrap gap-3">
              <AnimatePresence>
                {snap.players.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ scale: 0, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    className="glass flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4"
                  >
                    <Avatar emoji={p.avatar} seed={p.id} size={40} />
                    <span className="text-lg font-semibold">{p.name}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          {isHost && (
            <button
              onClick={onStart}
              disabled={snap.players.length === 0}
              className="btn-press mt-8 self-start rounded-2xl px-10 py-5 font-display text-2xl font-bold text-ink disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #ffe08a, #f5c451 55%, #d9a43a)", boxShadow: "0 18px 40px -16px rgba(245,196,81,.7)" }}
            >
              {t("startGame")} →
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

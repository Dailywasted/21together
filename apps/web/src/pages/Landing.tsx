import { useState } from "react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { useT } from "../lib/i18n";
import { setHostToken } from "../lib/storage";
import { unlockAudio } from "../lib/sound";
import { navigate } from "../lib/router";
import { PlayingCard } from "../components/PlayingCard";
import { Logo } from "../components/ui";
import { LangToggle } from "../components/LangToggle";
import type { Card } from "@21/engine";

const HERO: Card[] = ["AS", "KH"];

export function Landing() {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function host() {
    setBusy(true);
    setErr(null);
    unlockAudio();
    try {
      const r = await api.createRoom();
      setHostToken(r.code, r.hostToken);
      navigate(`/host/${r.code}`);
    } catch {
      setErr("Network error");
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) return;
    try {
      const info = await api.roomInfo(c);
      if (!info.exists) {
        setErr(t("roomNotFound"));
        return;
      }
    } catch {
      /* let the play page handle it */
    }
    navigate(`/j/${c}`);
  }

  return (
    <div className="grain relative min-h-full overflow-hidden bg-ink">
      <div className="pointer-events-none absolute inset-0" style={{ background: "var(--felt-glow)" }} />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(245,196,81,.35), transparent)" }}
      />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <LangToggle />
      </header>

      <main className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-5xl font-bold leading-[0.95] md:text-7xl"
          >
            {t("tagline").split(",")[0]}
            {t("tagline").includes(",") && (
              <>
                ,<br />
                <span className="gold-text">{t("tagline").split(",")[1]!.trim()}</span>
              </>
            )}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 max-w-md text-lg text-muted"
          >
            {t("subtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="mt-9 flex flex-col gap-3 sm:max-w-md"
          >
            <button
              onClick={host}
              disabled={busy}
              className="btn-press group relative overflow-hidden rounded-2xl px-6 py-4 text-left font-display text-lg font-bold text-ink disabled:opacity-70"
              style={{ background: "linear-gradient(135deg, #ffe08a, #f5c451 55%, #d9a43a)", boxShadow: "0 18px 40px -16px rgba(245,196,81,.7)" }}
            >
              <span className="shimmer absolute inset-0" />
              <span className="relative flex items-center justify-between">
                <span>
                  {busy ? t("creating") : t("hostGame")}
                  <span className="block text-sm font-medium opacity-70">{t("hostHint")} 📺</span>
                </span>
                <span className="text-2xl transition-transform group-hover:translate-x-1">→</span>
              </span>
            </button>

            <form onSubmit={join} className="glass flex items-center gap-2 rounded-2xl p-2">
              <input
                value={code}
                onChange={(e) => {
                  setErr(null);
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4));
                }}
                placeholder={t("enterCode")}
                aria-label={t("enterCode")}
                autoCapitalize="characters"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-display text-xl font-bold tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:font-sans placeholder:text-base placeholder:font-medium placeholder:text-muted focus:outline-none"
              />
              <button
                type="submit"
                disabled={code.length !== 4}
                className="btn-press rounded-xl bg-white px-5 py-2.5 font-bold text-ink disabled:opacity-30"
              >
                {t("join")}
              </button>
            </form>
            {err && <p className="text-sm text-lose">{err}</p>}
          </motion.div>

          <ol className="mt-10 grid max-w-md grid-cols-2 gap-3 text-sm">
            {(["how1", "how2", "how3", "how4"] as const).map((k, i) => (
              <motion.li
                key={k}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.06 }}
                className="glass rounded-2xl p-3.5"
              >
                <span className="mb-1 block font-display text-xs font-bold text-gold">0{i + 1}</span>
                <span className="text-text/90">{t(k)}</span>
              </motion.li>
            ))}
          </ol>
        </div>

        <div className="relative hidden h-[460px] md:block" aria-hidden>
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative h-[340px] w-[420px]">
              {HERO.map((c, i) => (
                <motion.div
                  key={c}
                  className="absolute left-1/2 top-1/2"
                  initial={{ opacity: 0, y: 60, rotate: 0, x: "-50%" }}
                  animate={{ opacity: 1, y: "-50%", rotate: i === 0 ? -10 : 9, x: i === 0 ? "-88%" : "-12%" }}
                  transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.3 + i * 0.15 }}
                >
                  <PlayingCard card={c} width={190} glow={i === 1 ? "gold" : null} />
                </motion.div>
              ))}
              <motion.div
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-5 py-2 font-display text-xl font-bold text-ink"
                style={{ background: "linear-gradient(135deg, #ffe08a, #f5c451)" }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", delay: 0.9 }}
              >
                BLACKJACK · 3:2
              </motion.div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

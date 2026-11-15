import { useState } from "react";
import { motion } from "motion/react";
import { AVATARS } from "@21/engine";
import { Avatar, Logo } from "../components/ui";
import { LangToggle } from "../components/LangToggle";
import { useT } from "../lib/i18n";
import { getProfile, setProfile } from "../lib/storage";
import { unlockAudio, haptic } from "../lib/sound";

export function JoinForm({ code, onJoin }: { code: string; onJoin: (name: string, avatar: string) => void }) {
  const t = useT();
  const saved = getProfile();
  const [name, setName] = useState(saved?.name ?? "");
  const [avatar, setAvatar] = useState(saved?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]!);
  const valid = name.trim().length >= 1;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    unlockAudio();
    haptic(15);
    setProfile({ name: name.trim(), avatar });
    onJoin(name.trim(), avatar);
  }

  return (
    <div className="grain relative min-h-full overflow-hidden bg-ink">
      <div className="pointer-events-none absolute inset-0" style={{ background: "var(--felt-glow)" }} />
      <form onSubmit={submit} className="relative mx-auto flex min-h-full max-w-md flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex items-center justify-between">
          <Logo size={22} />
          <LangToggle />
        </div>

        <div className="mt-10 flex flex-col items-center">
          <motion.div key={avatar} initial={{ scale: 0.7, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 400, damping: 14 }}>
            <Avatar emoji={avatar} seed={name || "x"} size={104} ring="#f5c451" />
          </motion.div>
          <div className="mt-4 text-xs font-bold tracking-[0.3em] text-white/40 uppercase">
            {t("code")} <span className="text-gold">{code}</span>
          </div>
        </div>

        <label className="mt-8 block">
          <span className="mb-2 block text-xs font-bold tracking-[0.2em] text-white/50 uppercase">{t("yourName")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            maxLength={16}
            autoComplete="nickname"
            enterKeyHint="go"
            className="glass w-full rounded-2xl px-4 py-4 text-xl font-bold placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-gold/60"
            placeholder="Alex"
          />
        </label>

        <div className="mt-6">
          <span className="mb-2 block text-xs font-bold tracking-[0.2em] text-white/50 uppercase">{t("pickAvatar")}</span>
          <div className="grid grid-cols-8 gap-2">
            {AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => {
                  haptic(8);
                  setAvatar(a);
                }}
                className={`btn-press grid aspect-square place-items-center rounded-xl text-2xl ${a === avatar ? "bg-gold/25 ring-2 ring-gold" : "bg-white/5"}`}
                aria-pressed={a === avatar}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={!valid}
          className="btn-press mt-auto w-full rounded-2xl py-5 font-display text-xl font-bold text-ink disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #ffe08a, #f5c451 55%, #d9a43a)", boxShadow: "0 18px 40px -16px rgba(245,196,81,.7)", marginTop: 32 }}
        >
          {t("takeSeat")} →
        </button>
      </form>
    </div>
  );
}

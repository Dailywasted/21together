import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import type { HostCmd } from "@21/protocol";
import { Stage } from "./Stage";
import { Felt, DealerHand, SharedRow, Seats, Shoe, BettingHint } from "./Table";
import { Sidebar } from "./Sidebar";
import { Banner } from "./Banner";
import { Lobby } from "./Lobby";
import { Awards } from "./Awards";
import { HostControls } from "./Controls";
import { Effects } from "./Effects";
import { useGame } from "../lib/store";
import { getHostToken } from "../lib/storage";
import { api } from "../lib/api";
import { useT } from "../lib/i18n";
import { unlockAudio } from "../lib/sound";
import { Logo } from "../components/ui";

export default function HostPage({ code }: { code: string }) {
  const t = useT();
  const { snap, status, role, clockOffset, connect, send } = useGame();
  const [missing, setMissing] = useState(false);
  const token = getHostToken(code);

  useEffect(() => {
    let cancelled = false;
    api
      .roomInfo(code)
      .then((info) => {
        if (cancelled) return;
        if (!info.exists) setMissing(true);
        else connect(code, token ? "host" : "spectator", token ?? undefined);
      })
      .catch(() => connect(code, token ? "host" : "spectator", token ?? undefined));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Keep the TV awake.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request("screen") ?? null;
      } catch {
        /* ignore */
      }
    };
    void req();
    const onVis = () => document.visibilityState === "visible" && void req();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, []);

  const isHost = role === "host";
  const cmd = (c: HostCmd) => {
    unlockAudio();
    send({ t: "host", cmd: c });
  };

  if (missing) {
    return (
      <div className="grid h-full place-items-center bg-ink text-center">
        <div>
          <Logo />
          <p className="mt-6 text-xl text-muted">{t("roomNotFound")}</p>
          <a href="/" className="mt-6 inline-block rounded-xl bg-white px-5 py-3 font-bold text-ink">
            ← 21Together
          </a>
        </div>
      </div>
    );
  }

  return (
    <Stage>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 40% 30%, #0c1512, #06080b 70%)" }} />
      {snap ? (
        <>
          <Felt rules={snap.rules} />
          <div className="absolute left-[76px] top-[26px] z-10 flex items-center gap-4">
            <Logo size={24} />
          </div>
          <div className="absolute left-[1400px] top-[26px] z-10 -translate-x-1/2 text-right">
            {snap.roundNo > 0 && (
              <span className="tabular text-sm font-bold tracking-[0.2em] text-white/45 uppercase">
                {t("round")} {snap.roundNo}
              </span>
            )}
          </div>
          <Shoe snap={snap} />
          <DealerHand snap={snap} />
          <Banner snap={snap} offset={clockOffset} />
          <SharedRow snap={snap} />
          <BettingHint snap={snap} />
          <Seats snap={snap} />
          <Sidebar snap={snap} />
          <Effects snap={snap} offset={clockOffset} />
          <AnimatePresence>
            {snap.phase === "lobby" && <Lobby snap={snap} isHost={isHost} onStart={() => cmd({ c: "start" })} />}
          </AnimatePresence>
          {snap.phase === "ended" && <Awards snap={snap} isHost={isHost} onAgain={() => cmd({ c: "start" })} />}
          {isHost && <HostControls snap={snap} cmd={cmd} />}
          {!isHost && role === "spectator" && status === "open" && (
            <div className="absolute bottom-4 left-6 z-10 text-xs font-semibold text-white/30">{t("spectating")}</div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-4">
            <Logo size={40} />
            <span className="animate-pulse text-xl text-muted">{t("connecting")}</span>
          </div>
        </div>
      )}
      {status === "reconnecting" && snap && (
        <div className="absolute left-1/2 top-[1030px] z-50 -translate-x-1/2 rounded-full bg-lose/90 px-4 py-1.5 text-sm font-bold text-ink">
          {t("reconnecting")}
        </div>
      )}
    </Stage>
  );
}

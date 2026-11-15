import { useEffect, useState, type ReactNode } from "react";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Fixed 1920×1080 canvas scaled to fit any screen (TV, laptop, 4K) with letterboxing. */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden bg-ink">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" }}
      >
        {children}
      </div>
    </div>
  );
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

const StageWidth = createContext(STAGE_W);
/** Logical width of the stage (1920 on 16:9, wider on ultrawide screens in fluid mode). */
export const useStageWidth = () => useContext(StageWidth);

/**
 * A 1080-tall canvas scaled to fit any screen (TV, laptop, 4K).
 * Fixed mode letterboxes a 1920×1080 canvas; fluid mode widens the canvas to fill ultrawide screens.
 */
export function Stage({ children, fluid = false }: { children: ReactNode; fluid?: boolean }) {
  const [dims, setDims] = useState({ scale: 1, width: STAGE_W });
  useEffect(() => {
    const fit = () => {
      const aspect = window.innerWidth / window.innerHeight;
      const width = fluid ? Math.round(Math.min(3840, Math.max(STAGE_W, STAGE_H * aspect))) : STAGE_W;
      setDims({ width, scale: Math.min(window.innerWidth / width, window.innerHeight / STAGE_H) });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fluid]);
  return (
    <div className="fixed inset-0 overflow-hidden bg-ink">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: dims.width, height: STAGE_H, transform: `translate(-50%, -50%) scale(${dims.scale})`, transformOrigin: "center" }}
      >
        <StageWidth.Provider value={dims.width}>{children}</StageWidth.Provider>
      </div>
    </div>
  );
}

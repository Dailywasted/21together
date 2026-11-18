import { StrictMode, Suspense, lazy, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Landing } from "./pages/Landing";
import { useLang } from "./lib/i18n";
import { diag } from "./lib/store";

const Host = lazy(() => import("./host/HostPage"));
const Play = lazy(() => import("./play/PlayPage"));

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}

function App() {
  const path = useSyncExternalStore(subscribe, () => location.pathname);
  const host = path.match(/^\/host\/([A-Za-z]{4})\/?$/);
  const play = path.match(/^\/(?:j|play)\/([A-Za-z]{4})\/?$/);
  return (
    <Suspense fallback={<div className="h-full bg-ink" />}>
      {host ? <Host code={host[1]!.toUpperCase()} /> : play ? <Play code={play[1]!.toUpperCase()} /> : <Landing />}
    </Suspense>
  );
}

document.documentElement.lang = useLang.getState().lang;

// Room log: how this page started (a "reload" nobody asked for points to a crash), and any errors.
{
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  diag("page load", `${nav?.type ?? "?"} · ${location.pathname} · ${navigator.userAgent.slice(0, 120)}`);
  window.addEventListener("error", (e) => diag("js error", `${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => diag("js error", `promise: ${String((e.reason as Error)?.message ?? e.reason)}`));
  document.addEventListener("visibilitychange", () => diag("visibility", document.visibilityState));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

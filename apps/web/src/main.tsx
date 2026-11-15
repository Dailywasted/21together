import { StrictMode, Suspense, lazy, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Landing } from "./pages/Landing";
import { useLang } from "./lib/i18n";

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

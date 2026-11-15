import { useLang } from "../lib/i18n";

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`glass inline-flex rounded-full p-1 text-xs font-bold ${className}`} role="group" aria-label="Language">
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`btn-press rounded-full px-3 py-1.5 uppercase tracking-wide ${lang === l ? "bg-white text-ink" : "text-muted hover:text-text"}`}
          aria-pressed={lang === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

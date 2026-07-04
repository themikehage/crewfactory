import { useContext } from "react";
import { LiteralsContext } from "@/lib";
import type { SupportedLocale } from "@/lib";

const locales: { value: SupportedLocale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Espanol" },
];

export function LocaleSelector() {
  const { locale, setLocale } = useContext(LiteralsContext);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
        Language
      </span>
      <div className="flex bg-background border border-input rounded-lg overflow-hidden">
        {locales.map((l) => (
          <button
            key={l.value}
            onClick={() => setLocale(l.value)}
            className={`px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              locale === l.value
                ? "bg-primary text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-card-hover/50"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

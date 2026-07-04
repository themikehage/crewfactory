export type SupportedLocale = "en" | "es";

export type LiteralsRecord = Record<SupportedLocale, Record<string, string>>;

export interface LiteralsContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
}

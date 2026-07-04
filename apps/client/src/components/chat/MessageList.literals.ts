import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    prevVersion: "Previous version",
    nextVersion: "Next version",
  },
  es: {
    prevVersion: "Version anterior",
    nextVersion: "Version siguiente",
  },
};

import { useContext } from "react";
import { LiteralsContext } from "./LiteralsContext";
import type { SupportedLocale } from "./types";

export function useLiterals<T extends Record<string, string>>(
  literals: Record<SupportedLocale, T>,
): T {
  const { locale } = useContext(LiteralsContext);
  return literals[locale];
}

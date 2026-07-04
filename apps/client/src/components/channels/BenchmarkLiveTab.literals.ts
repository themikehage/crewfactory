import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    unknownError: "Unknown error",
    judgeError: "Judge evaluation failed",
    judgeFailed: "Judge failed",
    runJudgeError: "Failed to run judge",
  },
  es: {
    unknownError: "Error desconocido",
    judgeError: "La evaluacion del juez fallo",
    judgeFailed: "El juez fallo",
    runJudgeError: "Error al ejecutar el juez",
  },
};

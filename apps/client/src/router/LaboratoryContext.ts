import { createContext, createElement, useContext, type ReactNode } from "react";
import type { useLaboratoryController } from "@/hooks/useLaboratoryController";

const LaboratoryContext = createContext<ReturnType<typeof useLaboratoryController> | null>(null);

export function LaboratoryProvider({ controller, children }: { controller: ReturnType<typeof useLaboratoryController>; children: ReactNode }) {
  return createElement(LaboratoryContext.Provider, { value: controller }, children);
}

export function useLaboratory(): ReturnType<typeof useLaboratoryController> {
  const controller = useContext(LaboratoryContext);
  if (!controller) throw new Error("useLaboratory must be used within LaboratoryProvider");
  return controller;
}

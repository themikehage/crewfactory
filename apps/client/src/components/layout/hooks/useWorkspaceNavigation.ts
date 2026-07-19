import { useEffect, useRef } from "react";
import type { RoutePage } from "@/router/useRoutePage";

export function useWorkspaceNavigation(page: RoutePage, onNavigate: (path: string) => void) {
  const pendingWorkspaceFile = useRef<string | null>(null);

  useEffect(() => {
    const handleOpenWorkspace = (e: Event) => {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path ?? null;
      if (page !== "workspace") {
        pendingWorkspaceFile.current = path;
        onNavigate("/workspace");
      }
    };
    window.addEventListener("openWorkspaceFile", handleOpenWorkspace);
    return () => {
      window.removeEventListener("openWorkspaceFile", handleOpenWorkspace);
    };
  }, [onNavigate, page]);

  useEffect(() => {
    if (page === "workspace" && pendingWorkspaceFile.current) {
      const path = pendingWorkspaceFile.current;
      pendingWorkspaceFile.current = null;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("openWorkspaceFile", { detail: { path } }));
      }, 150);
    }
  }, [page]);
}

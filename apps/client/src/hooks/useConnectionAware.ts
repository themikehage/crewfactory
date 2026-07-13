import { useEffect, useRef } from "react";
import { wsClient } from "@/lib/ws-client";

export function useConnectionAwareEffect(
  action: () => void,
  deps: React.DependencyList
): void {
  const actionRef = useRef(action);
  actionRef.current = action;

  const lastDepsRef = useRef<string>("");
  const wasConnectedRef = useRef<boolean>(false);
  const hasRunForCurrentDepsRef = useRef<boolean>(false);

  useEffect(() => {
    const depsKey = JSON.stringify(deps);
    const depsChanged = lastDepsRef.current !== depsKey;

    if (depsChanged) {
      lastDepsRef.current = depsKey;
      hasRunForCurrentDepsRef.current = false;
    }

    const isCurrentlyConnected = wsClient.getState() === "connected";

    if (isCurrentlyConnected && (!hasRunForCurrentDepsRef.current || depsChanged)) {
      actionRef.current();
      hasRunForCurrentDepsRef.current = true;
      wasConnectedRef.current = true;
    } else if (!isCurrentlyConnected) {
      wasConnectedRef.current = false;
    }

    const unsub = wsClient.onStateChange((state) => {
      if (state === "connected") {
        if (!wasConnectedRef.current || !hasRunForCurrentDepsRef.current) {
          actionRef.current();
          hasRunForCurrentDepsRef.current = true;
        }
        wasConnectedRef.current = true;
      } else if (state === "disconnected") {
        wasConnectedRef.current = false;
        hasRunForCurrentDepsRef.current = false;
      }
    });

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

import { useEffect, useRef } from "react";
import { wsClient } from "@/lib/ws-client";

export function useConnectionAwareEffect(
  action: () => void,
  deps: React.DependencyList
): void {
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    if (wsClient.getState() === "connected") {
      actionRef.current();
    }
    const unsub = wsClient.onStateChange((state) => {
      if (state === "connected") {
        actionRef.current();
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

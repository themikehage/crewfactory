import { useState, useEffect, useCallback } from "react";

export interface NavigationStackItem {
  type: "home" | "context" | "admin";
  contextType?: "project" | "agent" | "channel";
  contextId?: string;
  contextName?: string;
  page?: string;
  path?: string;
}

export interface UseNavigationStackReturn {
  stack: NavigationStackItem[];
  current: NavigationStackItem | null;
  push: (item: NavigationStackItem) => void;
  pop: () => NavigationStackItem | null;
  canGoBack: boolean;
  clear: () => void;
}

const STORAGE_KEY = "nav-stack-mobile";

export function useNavigationStack(): UseNavigationStackReturn {
  const [stack, setStack] = useState<NavigationStackItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load navigation stack from localStorage:", e);
    }
    return [{ type: "home", page: "home", path: "/" }];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
    } catch (e) {
      console.error("Failed to save navigation stack to localStorage:", e);
    }
  }, [stack]);

  const current = stack[stack.length - 1] || null;
  const canGoBack = stack.length > 1;

  const push = useCallback((item: NavigationStackItem) => {
    setStack((prev) => {
      const newStack = [...prev];
      const top = newStack[newStack.length - 1];
      if (top) {
        // If we navigate to the same context, replace the top of the stack to avoid duplicates
        if (
          top.type === "context" &&
          item.type === "context" &&
          top.contextId === item.contextId &&
          top.contextType === item.contextType
        ) {
          newStack[newStack.length - 1] = item;
          return newStack;
        }
        // If identical, do nothing
        if (top.type === item.type && top.page === item.page && top.path === item.path) {
          return prev;
        }
      }
      return [...newStack, item];
    });
  }, []);

  const pop = useCallback((): NavigationStackItem | null => {
    let popped: NavigationStackItem | null = null;
    setStack((prev) => {
      if (prev.length <= 1) return prev;
      const newStack = [...prev];
      popped = newStack.pop() || null;
      return newStack;
    });
    return popped;
  }, []);

  const clear = useCallback(() => {
    setStack([{ type: "home", page: "home", path: "/" }]);
  }, []);

  return {
    stack,
    current,
    push,
    pop,
    canGoBack,
    clear,
  };
}

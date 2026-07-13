import { useEffect, useRef, useState, useCallback } from "react";

interface UseChatScrollOptions {
  threshold?: number;
  messages?: unknown[];
  isStreaming?: boolean;
}

export function useChatScroll(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  options: UseChatScrollOptions = {}
) {
  const { threshold = 50, messages, isStreaming = false } = options;
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isAtBottomRef = useRef(true);
  const lastScrollHeightRef = useRef(0);

  const checkIsAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight <= threshold + 2;
  }, [scrollContainerRef, threshold]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (behavior === "instant") {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTo({
        top: container.scrollHeight,
        behavior
      });
    }
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setShowScrollButton(false);
  }, [scrollContainerRef]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const atBottom = checkIsAtBottom();
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);

    if (atBottom) {
      setShowScrollButton(false);
    }
  }, [scrollContainerRef, checkIsAtBottom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    lastScrollHeightRef.current = container.scrollHeight;

    const resizeObserver = new ResizeObserver(() => {
      const { scrollHeight } = container;
      if (isAtBottomRef.current) {
        container.scrollTop = scrollHeight;
      } else {
        if (scrollHeight > lastScrollHeightRef.current) {
          setShowScrollButton(true);
        }
      }
      lastScrollHeightRef.current = scrollHeight;
    });

    const target = container.firstElementChild || container;
    resizeObserver.observe(target);

    return () => {
      resizeObserver.disconnect();
    };
  }, [scrollContainerRef]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom(isStreaming ? "instant" : "smooth");
    } else {
      setShowScrollButton(true);
    }
  }, [messages, isStreaming, scrollToBottom]);

  return {
    isAtBottom,
    showScrollButton,
    scrollToBottom,
    handleScroll
  };
}

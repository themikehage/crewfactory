import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface PortalPopoverProps {
  triggerRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  matchWidth?: boolean;
}

export function PortalPopover({
  triggerRef,
  open,
  onClose,
  children,
  className = "",
  matchWidth = false,
}: PortalPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [placement, setPlacement] = useState<"top" | "bottom">("top");

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const popoverEl = popoverRef.current;
    const popoverHeight = popoverEl?.offsetHeight ?? 320;
    const popoverWidth = matchWidth ? triggerRect.width : 320;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceAbove = triggerRect.top;
    const spaceBelow = viewportHeight - triggerRect.bottom;

    let finalPlacement: "top" | "bottom" = "top";
    let top: number;

    if (spaceAbove >= popoverHeight + 12 || spaceAbove >= spaceBelow) {
      finalPlacement = "top";
      top = triggerRect.top - popoverHeight - 8;
    } else {
      finalPlacement = "bottom";
      top = triggerRect.bottom + 8;
    }

    if (top < 8) {
      top = 8;
    }
    if (top + popoverHeight > viewportHeight - 8) {
      top = viewportHeight - popoverHeight - 8;
    }

    let left = triggerRect.left;
    const maxRight = viewportWidth - popoverWidth - 8;
    if (left > maxRight) {
      left = maxRight;
    }
    if (left < 8) {
      left = 8;
    }

    setPosition({ top, left, width: matchWidth ? triggerRect.width : 320 });
    setPlacement(finalPlacement);
  }, [triggerRef, matchWidth]);

  useEffect(() => {
    if (!open) return;

    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(updatePosition);
    });

    const popoverEl = popoverRef.current;
    let resizeObserver: ResizeObserver | undefined;

    if (popoverEl) {
      resizeObserver = new ResizeObserver(() => updatePosition());
      resizeObserver.observe(popoverEl);
    }

    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(raf1);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose, triggerRef]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, scale: 0.95, y: placement === "top" ? 8 : -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: placement === "top" ? 8 : -8 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            width: matchWidth ? position.width : undefined,
            zIndex: 9999,
          }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

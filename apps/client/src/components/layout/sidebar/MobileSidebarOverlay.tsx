import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

interface MobileSidebarOverlayProps {
  sidebarOpen: boolean;
  isHome: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  children: ReactNode;
}

export function MobileSidebarOverlay({
  sidebarOpen,
  isHome,
  onClose,
  onNavigate,
  children,
}: MobileSidebarOverlayProps) {
  return (
    <>
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            key="mobile-sidebar"
            initial={{ x: isHome ? 0 : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 z-50 w-full bg-background flex flex-col"
          >
            <div className="h-12 px-3 flex items-center border-b border-border bg-card/30 flex-shrink-0">
              <button onClick={() => { onClose(); onNavigate?.("/dashboard"); }} className="flex items-center gap-2">
                <Logo size={20} className="w-[20px] h-[20px]" />
                <span className="text-base font-semibold text-foreground">CrewFactory</span>
              </button>
            </div>
            <div className="flex-1 min-h-0 pb-14">
              {children}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sidebarOpen && !isHome && (
          <motion.div
            key="mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-40"
          />
        )}
      </AnimatePresence>
    </>
  );
}

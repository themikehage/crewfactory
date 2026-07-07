import { motion } from "framer-motion";
import { InfrastructurePanel } from "./InfrastructurePanel";
import { useLiterals } from "@/lib";
import { literals as u } from "./RightDrawer.literals";

interface Props {
  activeProjectName: string | null;
  onClose: () => void;
  onSendPrompt: (prompt: string) => void;
}

export function RightDrawer({
  activeProjectName,
  onClose,
  onSendPrompt,
}: Props) {
  const l = useLiterals(u);

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="w-85 sm:w-96 flex flex-col h-full bg-card border-l border-input flex-shrink-0 relative z-10"
    >
      <div className="h-12 border-b border-input flex items-center justify-between px-3 flex-shrink-0 bg-background/50 backdrop-blur-xs">
        <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
          Infrastructure
        </span>

        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 cursor-pointer transition-colors"
          title={l.closePanel || "Close"}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        <InfrastructurePanel
          activeProjectName={activeProjectName}
          onSendPrompt={onSendPrompt}
        />
      </div>
    </motion.div>
  );
}


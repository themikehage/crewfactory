import { motion } from "framer-motion";
import { ArrowRight, Square } from "lucide-react";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChatInput.literals";

interface SendStopButtonProps {
  streaming: boolean;
  disabled: boolean;
  onSend: () => void;
  onStop: () => void;
}

export function SendStopButton({
  streaming,
  disabled,
  onSend,
  onStop,
}: SendStopButtonProps) {
  const l = useLiterals(u);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled && !streaming) return;
    if (streaming) {
      onStop();
    } else {
      onSend();
    }
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled && !streaming}
      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer shadow-sm focus:outline-none transition-opacity ${
        streaming
          ? "bg-destructive text-white hover:bg-destructive/90"
          : "bg-primary text-background hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      }`}
      aria-label={streaming ? l.ariaStop : l.ariaSend}
      whileHover={disabled && !streaming ? {} : { scale: 1.05 }}
      whileTap={disabled && !streaming ? {} : { scale: 0.95 }}
      initial={false}
      animate={{
        rotate: streaming ? 90 : 0,
        scale: 1,
      }}
      transition={{ duration: 0.3 }}
    >
      {streaming ? (
        <Square size={14} className="fill-current text-white" />
      ) : (
        <ArrowRight size={16} />
      )}
    </motion.button>
  );
}

import { motion } from "framer-motion";
import { AttachmentPreview, type Attachment } from "./AttachmentPreview";
import { ChatTextarea } from "./ChatTextarea";

interface InputCardProps {
  streaming: boolean;
  disabled: boolean;
  focused: boolean;
  attachments: Attachment[];
  onRemoveAttachment: (id: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  toolbar: React.ReactNode;
}

export function InputCard({
  streaming,
  disabled,
  focused,
  attachments,
  onRemoveAttachment,
  input,
  onInputChange,
  onKeyDown,
  placeholder,
  textareaRef,
  toolbar,
}: InputCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`max-w-3xl mx-auto bg-[#171717] border rounded-2xl shadow-lg overflow-hidden transition-all duration-200 ${
        focused
          ? "border-primary ring-1 ring-primary/20 shadow-md"
          : streaming
          ? "border-primary/50"
          : "border-border/60 hover:border-border/90"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      {/* 1. AttachmentPreview */}
      <AttachmentPreview
        attachments={attachments}
        onRemove={onRemoveAttachment}
      />

      <div className="px-4 py-3">
        <ChatTextarea
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          textareaRef={textareaRef}
        />
      </div>

      {toolbar}
    </motion.div>
  );
}

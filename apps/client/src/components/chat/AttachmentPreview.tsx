import { motion, AnimatePresence } from "framer-motion";
import { X, FileText } from "lucide-react";

export interface Attachment {
  id: string;
  file: File;
  type: "image" | "document";
  previewUrl?: string;
}

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({
  attachments,
  onRemove,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="max-h-32 overflow-y-auto flex flex-wrap gap-2 p-2 border-b border-border/30">
      <AnimatePresence initial={false}>
        {attachments.map((att) => (
          <motion.div
            key={att.id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="relative group flex items-center gap-2 bg-[#171717] border border-border/60 rounded-lg p-1.5 pr-2.5 max-w-[200px] text-[11px] shrink-0"
          >
            {att.type === "image" && att.previewUrl ? (
              <img
                src={att.previewUrl}
                alt={att.file.name}
                className="w-8 h-8 object-cover rounded border border-border/40"
              />
            ) : (
              <div className="w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                <FileText size={14} />
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <span className="text-foreground truncate font-sans font-medium">
                {att.file.name}
              </span>
              <span className="text-muted-foreground text-xs">
                {(att.file.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-white hover:bg-destructive/90 flex items-center justify-center cursor-pointer shadow-sm md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            >
              <X size={10} strokeWidth={3} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

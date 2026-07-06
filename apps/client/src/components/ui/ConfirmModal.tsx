import { type FC } from "react";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}

export const ConfirmModal: FC<Props> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
}) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      children={
        <div className="px-4 py-3">
          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        </div>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-input rounded-lg text-xs font-semibold hover:bg-card-hover text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-opacity cursor-pointer disabled:opacity-50 ${
              destructive
                ? "bg-destructive text-foreground hover:opacity-90"
                : "bg-primary text-background hover:opacity-90"
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </>
      }
    />
  );
};

import { useState, useEffect } from "react";
import { wsClient } from "@/lib/ws-client";
import { useToast } from "@/contexts/ToastContext";

interface Props {
  toolCallId: string;
  args: {
    question: string;
    isMultiSelect?: boolean;
    options: string[];
    placeholder?: string;
    allowCustom?: boolean;
  };
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: {
      status?: string;
      payload?: {
        selectedOptions?: string[];
        customAnswer?: string;
      };
    };
    isError: boolean;
  } | null;
  sessionId: string | null;
}

export function AskQuestionForm({ toolCallId, args, result, sessionId }: Props) {
  const { addToast } = useToast();
  const {
    isMultiSelect = false,
    options = [],
    placeholder = "Escribe tu respuesta personalizada aquí...",
    allowCustom = true,
  } = args || {};

  const noOptions = options.length === 0;
  const showCustom = allowCustom || noOptions;

  const isResolved = !!result;
  const resolvedPayload = result?.details?.payload;

  const [selected, setSelected] = useState<Set<string>>(
    new Set(resolvedPayload?.selectedOptions || [])
  );
  const [customText, setCustomText] = useState(
    resolvedPayload?.customAnswer || ""
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = wsClient.subscribe("ui_action_error", (data: any) => {
      if (data.componentId === toolCallId) {
        setSubmitting(false);
        addToast("error", data.error || "Error al procesar la acción.");
      }
    });
    return unsub;
  }, [toolCallId, addToast]);

  useEffect(() => {
    if (!submitting) return;
    const timer = setTimeout(() => {
      setSubmitting(false);
      addToast("error", "No se recibió respuesta del servidor. Por favor intenta de nuevo.");
    }, 15000);
    return () => clearTimeout(timer);
  }, [submitting, addToast]);

  useEffect(() => {
    if (isResolved) setSubmitting(false);
  }, [isResolved]);

  const handleOptionToggle = (option: string) => {
    if (isResolved || submitting) return;
    const newSelected = new Set(selected);
    if (isMultiSelect) {
      if (newSelected.has(option)) {
        newSelected.delete(option);
      } else {
        newSelected.add(option);
      }
    } else {
      newSelected.clear();
      newSelected.add(option);
    }
    setSelected(newSelected);
  };

  const handleSubmit = () => {
    if (isResolved || submitting || !sessionId) return;
    if (wsClient.getState() !== "connected") {
      addToast("error", "No hay conexión con el servidor. Por favor espera a que se restablezca.");
      return;
    }
    if (selected.size === 0 && (!showCustom || !customText.trim())) {
      addToast("warning", "Por favor selecciona al menos una opción o escribe una respuesta personalizada.");
      return;
    }

    setSubmitting(true);
    wsClient.send({
      type: "ui_action",
      sessionId,
      componentId: toolCallId,
      action: "submit",
      payload: {
        selectedOptions: Array.from(selected),
        customAnswer: customText.trim() || undefined,
      },
    });
  };

  const handleCancel = () => {
    if (isResolved || submitting || !sessionId) return;
    if (wsClient.getState() !== "connected") {
      addToast("error", "No hay conexión con el servidor. Por favor espera a que se restablezca.");
      return;
    }
    setSubmitting(true);
    wsClient.send({
      type: "ui_action",
      sessionId,
      componentId: toolCallId,
      action: "cancel",
    });
  };

  return (
    <div className="font-sans">
      <div className="px-3 pb-2 space-y-1.5">
        {options.length > 0 && (
          <div className="grid grid-cols-1 gap-1">
            {options.map((option, idx) => {
              const isChecked = selected.has(option);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isResolved || submitting}
                  onClick={() => handleOptionToggle(option)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-left transition-all ${
                    isChecked
                      ? "bg-primary/10 text-foreground font-semibold"
                      : "hover:bg-card-hover/40 text-muted-foreground"
                  } ${isResolved ? "cursor-default" : "cursor-pointer"}`}
                >
                  <span className="break-words mr-2">{option}</span>
                  <div
                    className={`w-3.5 h-3.5 shrink-0 flex items-center justify-center transition-all ${
                      isMultiSelect ? "rounded-[2px]" : "rounded-full"
                    } ${
                      isChecked
                        ? "bg-primary text-primary-foreground"
                        : "bg-card-hover/60"
                    }`}
                  >
                    {isChecked && (
                      <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {showCustom && !isResolved && (
          <textarea
            disabled={submitting}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="w-full rounded-md border border-input bg-background/60 px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground/60 leading-relaxed outline-none focus:border-accent/70 transition-colors font-sans resize-none"
          />
        )}

        {isResolved && showCustom && customText && (
          <div className="text-xs text-muted-foreground leading-relaxed select-all bg-background/20 rounded-md px-2.5 py-1.5">
            {customText}
          </div>
        )}
      </div>

      {!isResolved && (
        <div className="flex items-center justify-end gap-1.5 px-3 pb-2">
          <button
            type="button"
            disabled={submitting}
            onClick={handleCancel}
            className="px-2 py-1 rounded text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            Ignorar
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="px-2.5 py-1 rounded bg-primary hover:opacity-90 text-[11px] font-bold text-primary-foreground transition-opacity cursor-pointer disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Enviar"}
          </button>
        </div>
      )}
    </div>
  );
}

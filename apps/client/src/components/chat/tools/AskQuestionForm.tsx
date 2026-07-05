import { useState } from "react";
import { wsClient } from "@/lib/ws-client";

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
  const {
    question = "¿?",
    isMultiSelect = false,
    options = [],
    placeholder = "Escribe tu respuesta personalizada aquí...",
    allowCustom = true,
  } = args || {};

  // Determinar si ya está resuelto
  const isResolved = !!result;
  const resolvedPayload = result?.details?.payload;

  // Estado local para el formulario interactivo
  const [selected, setSelected] = useState<Set<string>>(
    new Set(resolvedPayload?.selectedOptions || [])
  );
  const [customText, setCustomText] = useState(
    resolvedPayload?.customAnswer || ""
  );
  const [submitting, setSubmitting] = useState(false);

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
    if (selected.size === 0 && allowCustom && !customText.trim()) {
      alert("Por favor selecciona al menos una opción o escribe una respuesta personalizada.");
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
    setSubmitting(true);
    wsClient.send({
      type: "ui_action",
      sessionId,
      componentId: toolCallId,
      action: "cancel",
    });
  };

  return (
    <div className="w-full rounded-xl border border-border bg-card/40 overflow-hidden font-sans shadow-lg my-3 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-input/20 bg-background/30">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-bold text-foreground tracking-wide">
            Pregunta del Agente
          </span>
        </div>
        {isResolved ? (
          <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent">
            Respondido
          </span>
        ) : (
          <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-warning/10 border border-warning/20 text-warning animate-pulse">
            Pendiente
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4">
        {/* Question Title */}
        <h3 className="text-sm font-bold text-foreground leading-snug">
          {question}
        </h3>

        {/* Options Selection */}
        {options.length > 0 && (
          <div className="space-y-2">
            <span className="text-[9px] uppercase font-bold text-muted-foreground/75 tracking-wider block">
              {isMultiSelect ? "Selección múltiple" : "Selección única"}
            </span>
            <div className="grid grid-cols-1 gap-2">
              {options.map((option, idx) => {
                const isChecked = selected.has(option);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isResolved || submitting}
                    onClick={() => handleOptionToggle(option)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border text-xs text-left transition-all ${
                      isChecked
                        ? "border-accent bg-accent/5 text-foreground font-semibold"
                        : "border-input bg-card/60 hover:bg-card-hover/40 text-muted-foreground"
                    } ${isResolved ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <span className="break-words max-w-[90%]">{option}</span>
                    <div
                      className={`w-4 h-4 shrink-0 flex items-center justify-center border transition-all ${
                        isMultiSelect ? "rounded" : "rounded-full"
                      } ${
                        isChecked
                          ? "border-accent bg-accent text-bg"
                          : "border-muted-foreground/40 bg-transparent"
                      }`}
                    >
                      {isChecked && (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom Answer / Text Input */}
        {allowCustom && (
          <div className="space-y-1.5">
            <span className="text-[9px] uppercase font-bold text-muted-foreground/75 tracking-wider block">
              Respuesta personalizada
            </span>
            {isResolved ? (
              customText ? (
                <div className="p-3 rounded-lg border border-input/20 bg-background/20 text-xs text-foreground/90 font-mono whitespace-pre-wrap leading-relaxed select-all">
                  {customText}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/40 italic block py-1">
                  Ninguna respuesta personalizada escrita.
                </span>
              )
            ) : (
              <textarea
                disabled={submitting}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder={placeholder}
                rows={3}
                className="w-full rounded-lg border border-input bg-background/60 p-3 text-xs text-foreground placeholder-muted-foreground/60 leading-relaxed outline-none focus:border-accent/70 transition-colors font-sans resize-none"
              />
            )}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      {!isResolved && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 bg-background/20 border-t border-input/10">
          <button
            type="button"
            disabled={submitting}
            onClick={handleCancel}
            className="px-3 py-1.5 rounded bg-card hover:bg-card-hover/80 text-xs font-semibold text-muted-foreground border border-input transition-colors cursor-pointer disabled:opacity-50"
          >
            Ignorar
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="px-4 py-1.5 rounded bg-accent hover:opacity-90 text-xs font-bold text-bg transition-opacity cursor-pointer disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Enviar respuesta"}
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { wsClient } from "@/lib/ws-client";

interface FormField {
  name: string;
  label: string;
  type?: "text" | "password" | "number" | "select";
  required?: boolean;
  options?: string[];
}

interface Props {
  toolCallId: string;
  args: {
    title: string;
    description?: string;
    fields: FormField[];
  };
  result: {
    content: Array<{ type: string; text?: string }>;
    isError: boolean;
  } | null;
  sessionId: string | null;
}

export function DynamicFormCard({ toolCallId, args, result, sessionId }: Props) {
  const [localAction, setLocalAction] = useState<"submit" | "cancel" | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { title = "Formulario", description, fields = [] } = args || {};

  const resolvedStatus = result?.content?.[0]?.text; // "submitted" | "cancelled"
  const isResolved = !!resolvedStatus;

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleAction = (action: "submit" | "cancel") => {
    if (isResolved || !sessionId) return;

    if (action === "submit") {
      // Validaciones
      const newErrors: Record<string, string> = {};
      fields.forEach((field) => {
        if (field.required !== false && !formData[field.name]?.trim()) {
          newErrors[field.name] = "Este campo es requerido";
        }
      });

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      setLocalAction("submit");
      wsClient.send({
        type: "ui_action",
        sessionId,
        componentId: toolCallId,
        action: "submit",
        payload: formData,
      });
    } else {
      setLocalAction("cancel");
      wsClient.send({
        type: "ui_action",
        sessionId,
        componentId: toolCallId,
        action: "cancel",
      });
    }
  };

  return (
    <div className="w-full max-w-sm rounded-xl border border-input/40 bg-card/40 overflow-hidden font-sans shadow-md my-3 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-input/20">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="min-w-0">
            <span className="text-xs text-muted-foreground font-mono truncate block">request_form_input</span>
            <span className="text-xs font-bold text-foreground truncate block">{title}</span>
          </div>
        </div>

        {isResolved && (
          <div>
            {resolvedStatus === "submitted" ? (
              <span className="text-[10px] font-bold text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded uppercase">
                Enviado
              </span>
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground bg-muted border border-input px-2 py-0.5 rounded uppercase">
                Cancelado
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <form onSubmit={(e) => { e.preventDefault(); handleAction("submit"); }} className="px-4 py-3 space-y-3.5">
        {description && <p className="text-xs text-foreground/80 leading-relaxed">{description}</p>}

        {/* Inputs list */}
        <div className="space-y-3">
          {fields.map((field) => {
            const isFieldRequired = field.required !== false;
            return (
              <div key={field.name} className="space-y-1">
                <label className="block text-[10px] font-bold text-muted-foreground select-none">
                  {field.label} {isFieldRequired && <span className="text-error">*</span>}
                </label>
                
                {field.type === "select" ? (
                  <select
                    disabled={isResolved || localAction !== null}
                    value={formData[field.name] || ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    className="w-full bg-bg text-xs text-foreground border border-input rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent disabled:opacity-50 transition-colors"
                  >
                    <option value="">Seleccionar opción...</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || "text"}
                    disabled={isResolved || localAction !== null}
                    value={formData[field.name] || ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    className="w-full bg-bg text-xs text-foreground border border-input rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent disabled:opacity-50 transition-colors placeholder:text-muted-foreground/45"
                  />
                )}

                {errors[field.name] && (
                  <span className="block text-[10px] text-error font-semibold mt-0.5">
                    {errors[field.name]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </form>

      {/* Actions */}
      {!isResolved && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-input/20 bg-card/20">
          <button
            onClick={() => handleAction("cancel")}
            disabled={localAction !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-input text-foreground hover:bg-card-hover/80 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {localAction === "cancel" ? "Cancelando..." : "Cancelar"}
          </button>
          <button
            onClick={() => handleAction("submit")}
            disabled={localAction !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-background hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {localAction === "submit" ? "Enviando..." : "Enviar"}
          </button>
        </div>
      )}
    </div>
  );
}

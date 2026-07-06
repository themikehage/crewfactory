import { useState, useEffect } from "react";
import type { McpServerConfig } from "shared";
import { Button } from "@/components/ui/Button";

interface MCPCustomFormProps {
  initialConfig?: McpServerConfig | null;
  onSubmit: (config: McpServerConfig) => void;
  onCancel: () => void;
  onTest: (config: McpServerConfig) => Promise<{ success: boolean; tools: string[]; error?: string }>;
}

interface EnvVarRow {
  key: string;
  value: string;
}

export function MCPCustomForm({
  initialConfig,
  onSubmit,
  onCancel,
  onTest,
}: MCPCustomFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("npx");
  const [argsStr, setArgsStr] = useState("[]");
  const [url, setUrl] = useState("");
  const [envRows, setEnvRows] = useState<EnvVarRow[]>([]);
  
  // Validation / Test status states
  const [argsError, setArgsError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; tools: string[]; error?: string } | null>(null);

  useEffect(() => {
    if (initialConfig) {
      setName(initialConfig.name);
      setDescription(initialConfig.description || "");
      setTransport(initialConfig.transport);
      setCommand(initialConfig.command || "npx");
      setArgsStr(JSON.stringify(initialConfig.args || []));
      setUrl(initialConfig.url || "");
      
      const envs: EnvVarRow[] = [];
      if (initialConfig.env) {
        for (const [key, value] of Object.entries(initialConfig.env)) {
          envs.push({ key, value });
        }
      }
      setEnvRows(envs);
    } else {
      setName("");
      setDescription("");
      setTransport("stdio");
      setCommand("npx");
      setArgsStr("[]");
      setUrl("");
      setEnvRows([]);
    }
    setArgsError("");
    setTestResult(null);
  }, [initialConfig]);

  const handleArgsChange = (val: string) => {
    setArgsStr(val);
    try {
      const parsed = JSON.parse(val);
      if (!Array.isArray(parsed)) {
        setArgsError("Debe ser un array JSON válido, ejemplo: [\"-y\", \"@modelcontextprotocol/server-github\"]");
      } else {
        setArgsError("");
      }
    } catch {
      setArgsError("Formato de JSON inválido");
    }
  };

  const addEnvRow = () => {
    setEnvRows([...envRows, { key: "", value: "" }]);
  };

  const removeEnvRow = (idx: number) => {
    setEnvRows(envRows.filter((_, i) => i !== idx));
  };

  const updateEnvRow = (idx: number, key: string, value: string) => {
    const updated = [...envRows];
    updated[idx] = { key, value };
    setEnvRows(updated);
  };

  const buildConfigObject = (): McpServerConfig => {
    let parsedArgs: string[] = [];
    try {
      parsedArgs = JSON.parse(argsStr);
    } catch {}

    const envMap: Record<string, string> = {};
    for (const row of envRows) {
      if (row.key.trim()) {
        envMap[row.key.trim()] = row.value;
      }
    }

    // Generate stable ID from name if creating new
    const id = initialConfig?.id || name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");

    return {
      id,
      name,
      description,
      transport,
      command: transport === "stdio" ? command : undefined,
      args: transport === "stdio" ? parsedArgs : undefined,
      env: transport === "stdio" ? envMap : undefined,
      url: transport === "http" ? url : undefined,
      installed: true,
      enabled: initialConfig ? initialConfig.enabled : true,
      isBuiltin: initialConfig ? initialConfig.isBuiltin : false,
      status: initialConfig ? initialConfig.status : "disconnected",
      tools: initialConfig ? initialConfig.tools : [],
    };
  };

  const handleTest = async () => {
    setTestResult(null);
    setTesting(true);
    try {
      const config = buildConfigObject();
      const res = await onTest(config);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, tools: [], error: e.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (transport === "stdio" && argsError) return;
    if (transport === "http" && !url.trim()) return;

    const config = buildConfigObject();
    onSubmit(config);
  };

  return (
    <form onSubmit={handleSave} className="bg-card rounded-xl border border-input/20 overflow-hidden shadow-sm space-y-6 p-6">
      <div className="flex items-center justify-between border-b border-input/10 pb-4">
        <div>
          <h3 className="text-foreground font-semibold text-sm">
            {initialConfig ? "Editar Servidor MCP" : "Agregar Servidor MCP Personalizado"}
          </h3>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            Configura un proceso stdio o un servidor HTTP remoto compatible con MCP.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Cancelar
        </button>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div className="grid grid-cols-1 gap-1">
          <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Nombre del Servidor</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej: GitHub Tools, Mi Base de Datos"
            className="w-full px-3 py-2 bg-background border border-input/40 rounded-lg text-foreground outline-none focus:border-primary text-xs"
          />
        </div>

        {/* Description */}
        <div className="grid grid-cols-1 gap-1">
          <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve descripción de las herramientas expuestas por este servidor."
            className="w-full h-16 px-3 py-2 bg-background border border-input/40 rounded-lg text-foreground outline-none focus:border-primary text-xs resize-none"
          />
        </div>

        {/* Transport Type */}
        <div className="grid grid-cols-1 gap-1">
          <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Tipo de Transporte</label>
          <div className="flex gap-4 mt-1">
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
              <input
                type="radio"
                name="transport"
                checked={transport === "stdio"}
                onChange={() => setTransport("stdio")}
                className="accent-primary"
              />
              stdio (Comando local)
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
              <input
                type="radio"
                name="transport"
                checked={transport === "http"}
                onChange={() => setTransport("http")}
                className="accent-primary"
              />
              http (Servidor remoto SSE/POST)
            </label>
          </div>
        </div>

        {/* Stdio Inputs */}
        {transport === "stdio" && (
          <div className="space-y-4 bg-background/30 p-4 rounded-xl border border-input/10">
            <div className="grid grid-cols-1 gap-1">
              <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Comando base</label>
              <input
                type="text"
                required={transport === "stdio"}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="ej: npx, node, uvx"
                className="w-full px-3 py-2 bg-background border border-input/40 rounded-lg text-foreground outline-none focus:border-primary text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-1 gap-1">
              <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Argumentos (JSON Array)</label>
              <input
                type="text"
                required={transport === "stdio"}
                value={argsStr}
                onChange={(e) => handleArgsChange(e.target.value)}
                placeholder='ej: ["-y", "@modelcontextprotocol/server-github"]'
                className="w-full px-3 py-2 bg-background border border-input/40 rounded-lg text-foreground outline-none focus:border-primary text-xs font-mono"
              />
              {argsError && (
                <span className="text-xs text-error font-medium mt-0.5">{argsError}</span>
              )}
              <span className="text-xs text-muted-foreground mt-0.5">
                Usa <code className="bg-background px-1 py-0.2 rounded border border-input/10 text-foreground font-mono">$WORKSPACE_DIR</code> para montar el directorio de archivos del usuario de forma aislada.
              </span>
            </div>

            {/* Env Variables */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Variables de entorno</label>
                <button
                  type="button"
                  onClick={addEnvRow}
                  className="text-xs text-primary font-bold hover:underline transition-all cursor-pointer"
                >
                  + Agregar Variable
                </button>
              </div>

              {envRows.length > 0 && (
                <div className="space-y-2">
                  {envRows.map((row, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="KEY"
                        required
                        value={row.key}
                        onChange={(e) => updateEnvRow(idx, e.target.value, row.value)}
                        className="w-1/3 px-2 py-1.5 bg-background border border-input/40 rounded-lg text-foreground outline-none focus:border-primary text-xs font-mono uppercase"
                      />
                      <input
                        type="password"
                        placeholder="VALUE"
                        required
                        value={row.value}
                        onChange={(e) => updateEnvRow(idx, row.key, e.target.value)}
                        className="w-2/3 px-2 py-1.5 bg-background border border-input/40 rounded-lg text-foreground outline-none focus:border-primary text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeEnvRow(idx)}
                        className="p-1.5 hover:bg-card-hover/20 text-muted-foreground hover:text-error rounded transition-colors cursor-pointer"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* HTTP Inputs */}
        {transport === "http" && (
          <div className="bg-background/30 p-4 rounded-xl border border-input/10 grid grid-cols-1 gap-1">
            <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">URL del Servidor SSE/HTTP</label>
            <input
              type="url"
              required={transport === "http"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ej: http://localhost:3000/sse"
              className="w-full px-3 py-2 bg-background border border-input/40 rounded-lg text-foreground outline-none focus:border-primary text-xs font-mono"
            />
          </div>
        )}
      </div>

      {/* Connection Test Outputs */}
      {testResult && (
        <div className={`p-4 rounded-xl border ${
          testResult.success ? "bg-success/5 border-success/20 text-success" : "bg-destructive/5 border-destructive/20 text-error"
        } text-xs font-mono space-y-2`}>
          <div className="font-bold flex items-center gap-1.5 uppercase tracking-wider">
            {testResult.success ? (
              <>
                <span className="w-2 h-2 rounded-full bg-success" />
                Conexión Exitosa
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-error" />
                Error de Conexión
              </>
            )}
          </div>
          {testResult.success ? (
            <div>
              <span className="font-semibold block mb-1">Herramientas descubiertas ({testResult.tools.length}):</span>
              {testResult.tools.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {testResult.tools.map(t => (
                    <span key={t} className="bg-success/15 border border-success/25 px-2 py-0.5 rounded text-xs">
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground italic">Ninguna herramienta expuesta.</span>
              )}
            </div>
          ) : (
            <div className="whitespace-pre-wrap leading-normal font-sans">
              {testResult.error}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-input/10">
        <Button
          variant="outline"
          type="button"
          onClick={handleTest}
          disabled={testing || (!name.trim()) || (transport === "stdio" && !!argsError) || (transport === "http" && !url.trim())}
        >
          {testing && (
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
          )}
          Probar Conexión
        </Button>

        <div className="flex items-center gap-3">
          <Button variant="ghost" type="button" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={(!name.trim()) || (transport === "stdio" && !!argsError) || (transport === "http" && !url.trim())}
          >
            {initialConfig ? "Guardar Cambios" : "Agregar Servidor"}
          </Button>
        </div>
      </div>
    </form>
  );
}

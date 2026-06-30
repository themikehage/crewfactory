# Meta-Agent Optimization Loop

El workspace agent (global mode) actúa como **meta-agente** que crea agentes especializados, les delega tareas, observa su ejecución, y propone mejoras iterativas sobre skills y quick actions.

---

## 1. Motivación

Hoy el workspace agent puede crear agentes vía `factory-agents` y delegarles trabajo, pero no tiene visibilidad de lo que ocurre dentro de su sesión —no sabe si se trabaron, si ejecutaron comandos incorrectos, o si repiten patrones ineficientes. El resultado es que no puede aprender de la ejecución para optimizar.

El ciclo propuesto cierra ese loop:

```
Ciclo de Optimización Continua
┌─────────────────────────────────────────────────────┐
│  1. Crear agente especializado                       │
│  2. Delegar tarea + observar sesión                  │
│  3. Analizar logs, tool calls, errores               │
│  4. Identificar cuellos de botella y patrones        │
│  5. Proponer/implementar mejoras                     │
│     ├─ Skills (SKILL.md)                             │
│     └─ Quick Actions (scripts reutilizables)         │
│  6. Volver al paso 2 con el agente mejorado          │
└─────────────────────────────────────────────────────┘
```

---

## 2. Componentes Propuestos

### 2.1 Observation API (`GET /api/agents/:id/session-events`)

Nuevo endpoint SSE que permite a un agente (o usuario) suscribirse en tiempo real a los eventos de sesión de otro agente.

**Endpoint:** `GET /api/agents/:id/observe`

**Comportamiento:**
- Abre una conexión SSE al servidor Hono interno del agente objetivo (`/prompt` del `create-agent-server.ts`)
- Retorna los eventos de sesión filtrados: `tool_execution_start`, `tool_execution_end`, `agent_error`, `message_update` (text_delta)
- Incluye metadatos de contexto (tokens usados, duración)

**Uso desde el workspace agent:**
```json
{
  "message": "Observe al agente 'deploy-bot' mientras ejecuta la task X. Reporta cualquier error o comando fallido."
}
```

### 2.2 Agent Session Log Store

Almacenamiento estructurado de ejecuciones de agentes para análisis offline:

**Path:** `/tmp/crewfactory/{username}/agents/{agentId}/executions/`

Por cada prompt delegado:
```
executions/
  {executionId}/
    prompt.json           # El prompt original
    messages.jsonl        # Mensajes de la sesión (copia al finalizar)
    tool-calls.json       # Registro de tool calls con resultados
    errors.json           # Errores encontrados
    summary.json          # Resumen generado por el meta-agente
```

### 2.3 Analizador de Ejecución (Skill: `factory-observe`)

Nueva factory skill que el workspace agent usa para analizar ejecuciones:

**`workspace/.agents/skills/factory-observe/SKILL.md`**

Responsabilidades:
- Leer `tool-calls.json` y `errors.json` de una ejecución
- Identificar comandos fallidos, patrones de error, comandos repetitivos
- Detectar si el agente intentó comandos incorrectos (path equivocado, flag mal escrito)
- Detectar comandos que podrían ser reemplazados por un script
- Producir un reporte con recomendaciones

### 2.4 Generador de Quick Actions (Skill: `factory-quick-actions`)

Nueva factory skill para crear y registrar quick actions basadas en patrones detectados:

**`workspace/.agents/skills/factory-quick-actions/SKILL.md`**

Responsabilidades:
- Crear un script shell reutilizable en `workspace/assets/scripts/`
- Registrar el script como quick action en `integrations.json`
- Asociar la quick action a un repositorio o contexto específico
- Versionar la quick action (cada iteración puede refinarla)

---

## 3. Ciclo de Optimización - Flujo Detallado

### Fase 1: Observación

El workspace agent:
1. Crea un agente especializado (ej. `deploy-bot` con skill de deploy)
2. Delega: "Despliega el proyecto X en Coolify"
3. Abre un canal de observación SSE hacia la sesión del agente
4. Espera a que termine o detecta errores en tiempo real

### Fase 2: Análisis

Al finalizar:
1. Lee `tool-calls.json` y `errors.json`
2. Identifica: "El agente falló 3 veces porque el comando `coolify deploy` necesita un flag `--force` que no sabía"
3. También detecta: "Ejecutó `git status`, `git log`, `git diff` secuencialmente 5 veces en distintas sesiones — patrón repetitivo"

### Fase 3: Mejora

Basado en el análisis:
1. **Crear/actualizar skill**: Añade instrucción en el SKILL.md del agente: "Para deploy en Coolify, usa `coolify deploy --force`"
2. **Crear quick action**: Registra un script `git-status-summary.sh` que ejecuta los 3 comandos git de una, y lo asocia como quick action para el repositorio
3. **Re-ejecutar**: Vuelve a delegar la tarea al agente ahora mejorado

---

## 4. Requisitos Técnicos

### Backend

| Módulo | Cambio |
|--------|--------|
| `routes/agents.ts` | Nuevo endpoint `GET /api/agents/:id/observe` (SSE) |
| `routes/agents.ts` | Nuevo endpoint `GET /api/agents/:id/executions` (listar ejecuciones) |
| `routes/agents.ts` | Nuevo endpoint `GET /api/agents/:id/executions/:execId` (detalle) |
| `create-agent-server.ts` | Registrar tool calls y errores en `executions/{execId}/` |
| `create-agent-server.ts` | Exponer endpoint interno `/observe` (SSE) en el Hono del agente |
| `default-factory-skills.ts` | Añadir `factory-observe` y `factory-quick-actions` |
| `routes/integrations.ts` | Endpoint para crear/actualizar quick actions programáticamente |

### Frontend

| Componente | Cambio |
|------------|--------|
| `AgentsPage.tsx` | Pestaña "Ejecuciones" con historial por agente |
| `AgentsPage.tsx` | Visor de execution detail: tool calls, errores, summary |
| `ChatArea.tsx` | Indicador visual cuando una sesión está siendo observada |

### Base de Datos / Filesystem

No se requieren cambios en la estructura existente. Las ejecuciones se almacenan bajo el directorio del agente.

---

## 5. Seguridad y Scope

- La observación requiere `authMiddleware` — solo el usuario dueño del agente puede observar
- El workspace agent obtiene visibilidad porque corre en el contexto del mismo usuario
- Las ejecuciones heredan el aislamiento por username de agentes (`/tmp/crewfactory/{username}/agents/{agentId}/`)
- Sin cambios en el modelo de permisos existente

---

## 6. Métricas de Éxito

- Reducción de errores repetidos en ejecuciones del mismo agente
- Aumento de quick actions registradas por repositorio
- Disminución de comandos fallidos por tool call
- Tiempo medio por tarea delegada se reduce con cada iteración

---

## 7. Implementación Sugerida (Orden)

1. **Fase base**: Endpoint `/api/agents/:id/observe` (SSE) + registro de ejecuciones en `create-agent-server.ts`
2. **Skill `factory-observe`**: Analizador de ejecuciones y generación de reportes
3. **Skill `factory-quick-actions`**: Creación programática de scripts y quick actions
4. **Frontend**: Visor de ejecuciones en AgentsPage
5. **Loop completo**: Integración del workspace agent con el ciclo de mejora

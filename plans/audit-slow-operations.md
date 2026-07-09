# Audit: Slow Operations

Analisis de rendimiento de tres operaciones que los usuarios perciben como lentas: dividir tareas en subtareas, ejecutar el judge del laboratorio, y exportar un experimento como equipo de agentes.

---

## 1. Decompose Tasks (Dividir Tareas)

**Archivo:** `apps/server/src/core/tools/decompose-tool.ts`

### Flujo actual

1. Crea sesion temporal `plan_<toolCallId>` (I/O disco sincrono)
2. Una sola llamada LLM con prompt que incluye todo el objetivo
3. Espera respuesta completa (no streaming al padre)
4. Extrae JSON del mensaje del assistant
5. Destruye sesion temporal (I/O disco)
6. Escribe `tasks.json` a disco
7. Broadcasting `tasks_update` via WebSocket

### Cuello de botella

- **1 unica llamada LLM:** para objetivos complejos (15+ tareas con dependencias), el LLM debe producir todo en un solo turno. La calidad sufre y no hay reintento si el JSON es malo.
- **Sin streaming visible:** el usuario no ve progreso durante ~15-60 segundos. La UI se queda esperando el JSON completo.
- **Sesion temporal innecesaria:** crea y destruye un directorio completo de sesion para una sola llamada.

### Recomendacion

- **Problema aceptable por ahora.** La descomposicion es tipicamente rapida (~10-20s con modelos modernos). La falta de streaming al padre es el mayor problema de UX, no de velocidad real.
- Si se optimiza: reemplazar `session.prompt()` por `stream()` directo al provider, retransmitiendo los tokens al WebSocket del padre para feedback en vivo.

---

## 2. LLM Judge (Ejecutar el Judge)

**Archivo:** `apps/server/src/laboratory/judge.ts`

### Flujo actual

1. Crea sesion `judge_<uuid>` (I/O disco)
2. Barajado doble ciego de variantes (Alpha/Beta/Gamma)
3. **Una unica llamada LLM** con prompt que contiene:
   - Prompt original de la tarea
   - Todos los criterios de evaluacion
   - Output completo de las 3 variantes (concatenados)
4. Espera respuesta completa
5. Extrae JSON del texto plano
6. Mapea Alpha/Beta/Gamma a variantes reales
7. Valida con Zod
8. Destruye sesion judge

### Cuello de botella

- **Prompt ENORME:** para experimentos con respuestas largas de agentes (especialmente multi-agente con negociaciones), el prompt del judge puede acercarse al limite de contexto del modelo. El LLM tiene que leer 3 outputs completos + razonar sobre cada criterio + producir JSON estructurado.
- **1 sola llamada:** si falla el JSON, todo se pierde. No hay evaluacion parcial ni checkpoint.
- **Sin puntuacion en streaming:** el usuario ve texto crudo del judge pero no sabe los scores hasta el final.

### Recomendacion

- **Problema REAL.** Para experimentos con variantes que producen paginas de output, el judge es muy lento y propenso a errores de parsing.
- **Mejora prioritaria:** Dividir en 3 llamadas paralelas, una por variante. Cada llamada evalua una sola variante contra todos los criterios. Esto:
  - Reduce el tamano del prompt a 1/3
  - Permite paralelismo real (`Promise.all`)
  - Aisla fallos (si una variante falla, las otras siguen)
  - Permite mostrar resultados parciales a medida que cada variante se completa
- **Alternativa:** 1 llamada por criterio por variante (9 llamadas para 3 variantes x 3 criterios), pero es excesivo.

---

## 3. Exportar Experimento (Crear Equipo de Agentes)

**Archivos involucrados:**
- `apps/server/src/routes/experiments.ts` — `POST /:id/export`
- `apps/server/src/laboratory/experiment-store.ts` — `exportVariant()`
- `apps/server/src/agents/agent-registry.ts` — `register()`
- `apps/server/src/agents/create-agent-server.ts` — `createAgentServer()`
- `apps/server/src/channels/channel-store.ts` — `createChannel()`

### Flujo actual

1. Lee experimento de disco (`readFileSync`)
2. **Bucle SECUENCIAL** sobre agentes de la variante:
   - Por cada agente: `agentRegistry.register()` → `createAgentServer()`
   - `createAgentServer()` hace:
     - 7+ `mkdirSync` para crear workspace, sesiones, memoria, etc.
     - Inicializa base de datos de memoria (I/O async)
     - Descubre y carga skills del disco
     - Crea resource loader
     - Abre/crea session manager (lee/escribe JSONL)
     - Crea bash tool, ui tools, memory tools
     - Configura MCP tools (fire-and-forget)
3. Si es multi-agente: crea canal (`createChannel()` + `updateMembers()`) con I/O sincrono
4. Broadcasting `entity-updated` via WebSocket

### Cuello de botella

- **Bucle secuencial de agentes:** para un equipo de 5 agentes, `createAgentServer()` se ejecuta 5 veces en serie. Cada llamada hace docenas de operaciones de I/O sincrono. El tiempo total es `N * t` donde `t` ~500ms-2s por agente.
- **I/O sincrono masivo:** `mkdirSync`, `writeFileSync`, `readFileSync`, `readdirSync`, `existsSync` — todo bloquea el event loop.
- **Inicializacion pesada para nada:** `createAgentServer()` prepara memoria, skills, sesiones, MCP, etc. para agentes que vienen del laboratorio y probablemente no se usaran inmediatamente para chatear.
- **Sin `registerMany()`:** no hay API batch que permita diferir la inicializacion pesada.

### Recomendacion

- **Problema GRAVE.** Para exportaciones con 3-5+ agentes, el tiempo de espera es notable (3-10 segundos).
- **Mejora inmediata:** Paralelizar el registro de agentes con `Promise.all()`. Los agentes son independientes entre si.
  ```typescript
  const agentResults = await Promise.all(
    variant.agents.map((agent) => registerAgentIfMissing(username, agent))
  );
  ```
- **Mejora estructural:** Introducir `lazy-init` en `createAgentServer()` — que la inicializacion pesada (memoria, skills, MCP) ocurra bajo demanda (al primer prompt) en lugar de en el registro. El registro solo crea directorios y escribe `definition.json`.
- **Separar `register()` de `initialize()`:** el registro solo guarda la definicion. La inicializacion completa (session manager, tools, memoria) ocurre cuando el usuario abre el chat con ese agente.

---

---

## 4. Create Experiment (Crear Experimento via Lab-Architect)

**Archivos:**
- `apps/server/src/laboratory/create-experiment-tool.ts` — Tool handler
- `apps/server/src/laboratory/experiment-store.ts` — Persistencia
- `apps/server/src/agents/agent-registry.ts` — Registro de agentes
- `apps/server/src/core/prompts/lab-architect.ts` — Prompt del agente

### Flujo actual

1. Usuario envia prompt al lab-architect: "crea un experimento de X con Y agentes"
2. **LLM CALL (lab-architect):** el agente procesa el prompt, disena el equipo (roles, system prompts, skills, modelo, criterios), y llama a `create_experiment`
3. `create_experiment` tool handler:
   - Valida parametros
   - Resuelve modelos (sin LLM)
   - Bucle secuencial registra N agentes en `agentRegistry` (solo definiciones, no inicia servidores)
   - Compone variantes (single, multiNoLeader, multiWithLeader) con sus stances
   - Guarda experimento a disco
   - Broadcasts UI update
4. **Tool call completa, agente responde confirmacion**
5. Usuario hace clic en "Run" → `runExperiment()` ejecuta las 3 variantes (LLM calls reales ahi)

### Cuello de botella

- **La tool `create_experiment` en si es RAPIDA:** ~20-50ms. Hace CERO llamadas LLM. Solo registra definiciones de agentes (sin iniciar servidores) y escribe JSON.
- **Lo que el usuario percibe como lento es el lab-architect pensando.** Antes de llamar a la tool, el agente debe:
  1. Interpretar la solicitud del usuario
  2. Disenar el equipo completo (identificadores, roles, system prompts, skills, modelo, liderazgo)
  3. Definir criterios de evaluacion
  4. Componer el task prompt
  5. Generar el tool call con todos los datos
- El lab-architect NO tiene `spawn_subagent` ni `delegate_task`, asi que hace todo en un unico turno de LLM.

### Comparativa con otras operaciones

| Operacion | Tiempo percibido | Donde se va el tiempo |
|-----------|-----------------|----------------------|
| Decompose Tasks | 10-20s | 1 LLM call dentro de la tool |
| LLM Judge | 30-120s | 1 LLM call masivo dentro de la tool |
| Export Experiment | 3-10s | I/O sincrono secuencial (sin LLM) |
| **Create Experiment** | **15-40s** | **El lab-architect pensando (LLM call), NO la tool** |

### Recomendacion

- **Falso positivo.** La tool `create_experiment` no es el problema. El tiempo se va en la llamada LLM del lab-architect para disenar el experimento.
- **No hay optimizacion significativa posible** sin cambiar la arquitectura del lab-architect. La unica mejora seria darle herramientas de delegacion (`spawn_subagent`) para que pueda disenar agentes en paralelo, pero esto anadiria complejidad y no reducira el tiempo total significativamente (el LLM igual tiene que pensar el diseno completo).
- **Mejora de UX sugerida:** Si el lab-architect transmitiera su razonamiento (thinking) via streaming al WebSocket, el usuario veria que esta "pensando en el diseno" en lugar de solo ver un spinner. Esto ya deberia estar funcionando si el modelo soporta thinking streaming.

---

## Resumen y Priorizacion

| Operacion | Severidad | Impacto UX | Donde esta el cuello | Solucion | Esfuerzo |
|-----------|-----------|------------|---------------------|----------|----------|
| Decompose Tasks | Baja | 10-20s sin feedback | 1 LLM call dentro de la tool | Stream al padre | Pequeno |
| LLM Judge | **Alta** | 30-120s, propenso a errores | 1 LLM call masivo con 3 outputs | 3 llamadas paralelas | **Medio** |
| Export Experiment | **Alta** | 3-10s+ para 5 agentes | I/O sincrono secuencial | `Promise.all()` + lazy-init | **Medio** |
| **Create Experiment** | **Falso positivo** | 15-40s | **Lab-architect pensando, NO la tool** | N/A (stream thinking) | Bajo |

### Accion inmediata (bajo esfuerzo):
1. LLM Judge: dividir en 3 llamadas paralelas (`Promise.all` con una llamada por variante)
2. Export: paralelizar registro de agentes con `Promise.all`
3. Verificar que el lab-architect haga streaming de su thinking al WebSocket para feedback visual

### Accion estructural (medio esfuerzo):
4. Export: lazy-init en `createAgentServer` para diferir inicializacion pesada
5. Decompose: hook de streaming para mostrar progreso al usuario

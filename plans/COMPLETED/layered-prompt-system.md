COMPLETED
# Layered Prompt System

Rediseno del sistema de composicion de prompts para agentes, pasando de un modelo monolitico a uno de capas desacopladas, componibles y condicionales.

## Motivacion

Actualmente el prompt de un agente se construye de forma monolitica en dos lugares:

1. **`SessionPromptBuilder.buildSystemPrompts()`** — inyecta el `systemPrompt` completo del agente (que el Lab Architect define con acoplamiento al experimento) como system prompt del LLM.
2. **`ChannelOrchestrator.buildAgentPrompt()`** — construye el user message con roster, modo de ejecucion, reglas de comunicacion, contexto, historial y mensaje entrante.

Problemas:
- El Lab Architect puede meter cualquier cosa en el `systemPrompt`, incluyendo condicionales para las 3 variantes (single, multiNoLeader, multiWithLeader)
- Las reglas de comunicacion se repiten en cada mensaje de usuario (tokens desperdiciados)
- No hay separacion entre identidad del agente, su rol en el canal, el contexto de despliegue, y los protocolos activos
- Los agentes pierden su identidad pura al ser acoplados al experimento

## Objetivo

Separar el prompt en **4 capas desacopladas** que se componen condicionalmente segun el deployment context:

1. **Identity** (siempre) — Quien es el agente, su funcion principal, expertise
2. **Role** (condicional) — Instrucciones segun el rol del agente en el canal (leader/member/senior)
3. **Instance** (condicional) — Informacion del entorno de despliegue (solo/canal, roster de participantes, modo de ejecucion)
4. **Protocol** (condicional) — Protocolos de comunicacion activos en el canal (negotiation/arbitration)

## Diseno

### Modelo de datos

```typescript
interface PromptFragment {
  key: string;       // "role.leader.delegation", "protocol.negotiation", etc.
  category: "identity" | "role" | "instance" | "protocol";
  content: string;   // texto del fragmento, puede tener {placeholders}
  priority: number;  // orden de concatenacion dentro de la misma categoria
}

interface DeploymentContext {
  mode: "solo" | "broadcast" | "targeted";
  channelId?: string;
  members?: {
    agentId: string;
    agentName: string;
    role: "lead" | "senior" | "member";
    replyMode: string;
  }[];
  negotiationProtocol?: NegotiationProtocolConfig;
  arbitrationAgentId?: string;
}

interface LayeredPrompt {
  layers: string[];    // capas individuales (para debug)
  composed: string;    // prompt final concatenado
  applied: string[];   // fragment keys que se aplicaron
  skipped: string[];   // fragment keys que se omitieron (condicionales)
}
```

### Componentes

**`PromptFragmentRegistry`** — almacena los fragmentos:
- Defaults hardcodeados en TypeScript en `apps/server/src/core/prompts/fragments/`
- Overrides de usuario desde `{workspace}/prompt-overrides.json` con formato `{ "fragment.key": "custom text..." }`
- `get(key): PromptFragment | undefined` — resuelve override primero, cae a default
- `listByCategory(category): PromptFragment[]` — para composicion

**`PromptComposer`** — logica de composicion condicional:

```typescript
class PromptComposer {
  compose(
    agentDef: { name: string; role: string; systemPrompt: string },
    deployment: DeploymentContext
  ): LayeredPrompt {
    const fragments: PromptFragment[] = [];

    // Capa 1: Identity (siempre)
    fragments.push(this.resolveFragment("identity.agent_core", agentDef));

    // Capa 2: Role (condicional: solo si no esta en modo solo)
    if (deployment.mode !== "solo") {
      const agentMember = deployment.members?.find(m => m.agentId === agentDef.id);
      if (agentMember?.role === "lead") {
        fragments.push(...this.registry.listByCategory("role.leader"));
      } else {
        fragments.push(...this.registry.listByCategory("role.member"));
      }
    }

    // Capa 3: Instance (condicional segun modo)
    if (deployment.mode === "solo") {
      fragments.push(this.registry.get("instance.solo"));
    } else {
      fragments.push(this.registry.get("instance.channel.roster")); // interpola members
      fragments.push(this.registry.get("instance.channel." + deployment.mode));
    }

    // Capa 4: Protocol (condicional segun config del canal)
    if (deployment.negotiationProtocol) {
      const agentMember = deployment.members?.find(m => m.agentId === agentDef.id);
      if (agentMember?.role === "lead") {
        fragments.push(this.registry.get("protocol.arbitration"));
      } else {
        fragments.push(this.registry.get("protocol.negotiation"));
      }
    }

    return {
      layers: fragments.map(f => f.content),
      composed: fragments.map(f => f.content).join("\n\n"),
      applied: fragments.map(f => f.key),
      skipped: []
    };
  }
}
```

### Defaults iniciales (extraidos del codigo actual)

| Fragment Key | Origen actual | Contenido |
|---|---|---|
| `identity.agent_core` | `agentDef.systemPrompt` | Identidad pura del agente (interpola {name}, {role}) |
| `role.leader.delegation` | `buildAgentPrompt` user message rules | Delegacion: @menciona agentes, coordinar entregables |
| `role.leader.communication` | `buildAgentPrompt` lines 890-895 | Como responder al usuario siendo lider |
| `role.member.communication` | `buildAgentPrompt` lines 896-903 | Protocolo peer: no chatter, silent mode, chronology check |
| `instance.solo` | Nuevo | "Estas en modo individual. Resuelve toda la tarea de forma autonoma." |
| `instance.channel.roster` | `buildAgentPrompt` lines 884-888 | Lista de participantes con @menciones e IDs |
| `instance.channel.broadcast` | `buildAgentPrompt` lines 876-883 | Modo multi-agente sin lider, todos ven todos los mensajes |
| `instance.channel.targeted` | `buildAgentPrompt` lines 876-883 | Modo multi-agente con lider, solo respondes cuando te @mencionan |
| `protocol.negotiation` | Disperso en codigo | Reglas de negociacion entre miembros: acuerdo, rechazo, escalacion |
| `protocol.arbitration` | `ArbitrationProtocol` | Instrucciones para arbitro: emitir veredicto vinculante |

### Integracion

**`SessionPromptBuilder`** — reemplaza la inyeccion monolito del systemPrompt por el composer:

```typescript
// ANTES
if (agentDef?.systemPrompt) {
  appendPrompts.push(`Agent Instructions:\n${agentDef.systemPrompt}`);
}

// DESPUES
if (agentDef?.systemPrompt) {
  const deployment = this.resolveDeploymentContext(params);
  const layered = await promptComposer.compose(agentDef, deployment);
  appendPrompts.push(layered.composed);
}
```

**`ChannelOrchestrator.buildAgentPrompt()`** — se simplifica a historial + mensaje entrante:

```typescript
private buildAgentPrompt(agentDef, incomingMsg, recentHistory): string {
  // Sin roster, sin reglas, sin modo — ya estan en el system prompt
  let historyText = recentMessages.map(msg => 
    msg.role === "user" ? `[User]: ${msg.content}` : `[${msg.agentName}]: ${msg.content}`
  ).join("\n");
  const sender = incomingMsg.role === "user" ? "User" : incomingMsg.agentName;
  return `Conversation so far:\n${historyText}\n\n--- New message from ${sender} ---\n${incomingMsg.content}`;
}
```

**`resolveDeploymentContext`** — funcion nueva que determina el DeploymentContext:

```
channelId presente?
  → leer Channel desde ChannelStore
  → extraer miembros, replyModes, negotiationProtocol
  → determinar mode: "broadcast" | "targeted"
  → mapear roles: lead/senior/member

no channelId?
  → mode: "solo"
  → sin miembros, sin protocolo
```

### Lo que NO cambia

- `agent-session.ts` — sigue concatenando system prompt + append prompts igual
- `resource-loader.ts` — sin cambios
- `system-instructions.ts` — HTML_PREVIEW, AG_UI, memoria, subagentes se mantienen como fragmentos base no categorizables
- `ChannelOrchestrator.dispatchUserMessage` — sin cambios estructurales
- `ExperimentRunner` — sin cambios, los agentes se registran igual pero su system prompt ahora es solo identidad

### Impacto en Lab Architect

El prompt del Lab Architect se actualiza para que:
- Solo defina la **identidad pura** de cada agente (quien es, que sabe hacer)
- NO incluya instrucciones de comunicacion, protocolos, ni condicionales de variantes
- El sistema automaticamente inyecta las capas restantes segun el deployment context

Ejemplo de como cambia un experimento:

**Antes** — Lab Architect define agentes con system prompts que incluyen TODO:
```
Agente CEO systemPrompt:
"Eres el CEO. Coordinas al equipo. En single haces todo solo.
 En multiNoLeader no existes como coordinador.
 En multiWithLeader @mencionas a cada agente. Debes delegar tareas..."
```

**Despues** — Lab Architect solo define la identidad:
```
Agente CEO identity:
"Eres un CEO experto en startups fintech. Analizas requisitos de
 negocio, defines alcance de producto, y tomas decisiones ejecutivas."
```

El sistema inyecta automaticamente:
- `single` → identity + instance.solo
- `multiNoLeader` → identity + role.leader + instance.broadcast + protocol.negotiation
- `multiWithLeader` → identity + role.leader + instance.targeted + protocol.arbitration

### Plan de implementacion

| Fase | Descripcion | Riesgo |
|---|---|---|
| 1 | Crear `PromptFragment`, `PromptFragmentRegistry`, `PromptComposer`, `DeploymentContext`. Tests unitarios. No cablear aun. | Ninguno |
| 2 | Extraer reglas de `buildAgentPrompt` a defaults del registry. `buildAgentPrompt` sigue igual pero usando el registry internamente. | Bajo |
| 3 | Cablear `PromptComposer` en `SessionPromptBuilder`. Simplificar `buildAgentPrompt`. Implementar `resolveDeploymentContext`. | Medio |
| 4 | Actualizar `create_experiment` tool para solo identidad. Actualizar prompt del Lab Architect. Migrar experimentos existentes (extraer identidad pura). | Medio |
| 5 | Soporte de overrides de usuario (`prompt-overrides.json`). Endpoint de lectura. UI futura. | Bajo |

### Estructura de archivos resultante

```
apps/server/src/core/prompts/
  fragments/
    identity.ts          # identity.agent_core
    role-leader.ts       # role.leader.*
    role-member.ts       # role.member.*
    instance.ts          # instance.solo, instance.channel.*
    protocol.ts          # protocol.negotiation, protocol.arbitration
  registry.ts            # PromptFragmentRegistry
  composer.ts            # PromptComposer
  system-instructions.ts # HTML_PREVIEW, AG_UI, memoria, subagentes (sin cambios)
  lab-architect.ts       # prompt actualizado del Lab Architect
```

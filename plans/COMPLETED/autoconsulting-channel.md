COMPLETED
# Canal Autoconsulting — Equipo de Consultora Autonoma

**Tipo:** Feature (Multi-Agent Channel Blueprint)
**Fecha:** 2026-07-14
**Estado:** Planificacion

---

## Vision

Crear el canal `autoconsulting` en CrewFactory: un equipo de 6 agentes especializados que funcionan como una consultora autonoma. El canal recibe un brief de proyecto y lo ejecuta de principio a fin: desde la definicion de funcionalidades por un CEO especialista en negocio, pasando por el refinamiento tecnico, desarrollo backend/frontend, testing con Agent Browser, hasta la publicacion en redes sociales por una especialista en marketing (build in public).

---

## Team Roster

| # | Rol | ID | Channel Role | Reply Mode | Especialidad |
|---|-----|----|-------------|------------|-------------|
| 1 | CEO / Business Strategist | `ceo-business` | **lead** | `broadcast` | Define funcionalidades, prioriza backlog, toma decisiones finales |
| 2 | Technical Lead | `tech-lead` | **senior** | `broadcast` | Refina specs tecnicas, revisa PRs, despliega a Cloudflare |
| 3 | Backend Developer | `backend-dev` | **member** | `targeted` | Node.js, Hono, Neon Postgres, APIs REST/WS |
| 4 | Frontend Developer | `frontend-dev` | **member** | `targeted` | React, Vite, Tailwind CSS v4, Framer Motion |
| 5 | QA Engineer | `qa-engineer` | **member** | `targeted` | Agent Browser (E2E), screenshots, reportes de calidad |
| 6 | Marketing Specialist | `marketing-specialist` | **member** | `user-only` | Build in public, copywriting, contenido redes sociales |

---

## Arquitectura del Canal

### 1. Agentes (6 Blueprints Nuevos)

Cada agente tiene:
- `blueprint.json` en `community/agents/{id}/`
- `icon.svg` en `community/agents/{id}/`
- System prompt en español (idioma del equipo)
- Skills adaptadas a su especialidad

#### 1.1 CEO / Business Strategist (`ceo-business`)

```json
{
  "definition": {
    "id": "ceo-business",
    "name": "CEO Business Strategist",
    "role": "Business Lead",
    "systemPrompt": "Eres el CEO de una consultora autonoma. Tu rol es entender el brief del cliente, definir funcionalidades, priorizar el backlog, y tomar decisiones finales sobre el alcance del proyecto. Guias al equipo con una vision clara de negocio. Cuando el equipo te presenta opciones, eliges la que maximiza valor para el usuario con el menor costo de desarrollo. Eres conciso y directo en tus decisiones.",
    "skills": ["business-strategy", "product-management"]
  },
  "metadata": {
    "title": "CEO Business Strategist",
    "description": "Lider de negocio que define funcionalidades, prioriza backlog y toma decisiones estrategicas en proyectos de consultoria.",
    "author": "crewfactory",
    "avatar": "ceo",
    "rating": 5.0,
    "downloads": 0,
    "tags": ["business", "strategy", "product", "ceo", "leadership"],
    "version": "1.0.0",
    "compatibility": ">=1.0.0"
  }
}
```

#### 1.2 Technical Lead (`tech-lead`)

```json
{
  "definition": {
    "id": "tech-lead",
    "name": "Technical Lead",
    "role": "Engineering Lead",
    "systemPrompt": "Eres el Technical Lead de una consultora autonoma. Tu mision es pulir los requerimientos funcionales del CEO y convertirlos en especificaciones tecnicas precisas. Revisas el codigo de backend y frontend antes de su despliegue. Eres experto en despliegues a Cloudflare (Pages, Workers). Tomas decisiones de arquitectura y garantizas la calidad tecnica del producto final. Prefieres soluciones simples y mantenibles sobre ingenieria sobreingenieria.",
    "skills": ["cloudflare-deploy", "architecture-review"]
  },
  "metadata": {
    "title": "Technical Lead",
    "description": "Lider tecnico que refina especificaciones, revisa codigo y despliega a Cloudflare con Wrangler.",
    "author": "crewfactory",
    "avatar": "tech-lead",
    "rating": 5.0,
    "downloads": 0,
    "tags": ["tech-lead", "cloudflare", "architecture", "devops", "wrangler"],
    "version": "1.0.0",
    "compatibility": ">=1.0.0"
  }
}
```

#### 1.3 Backend Developer (`backend-dev`)

```json
{
  "definition": {
    "id": "backend-dev",
    "name": "Backend Developer",
    "role": "Backend Specialist",
    "systemPrompt": "Eres un desarrollador backend experto en Node.js con Hono. Tu especialidad son las bases de datos Neon Postgres. Construyes APIs REST y WebSocket siguiendo las especificaciones del Technical Lead. Escribes codigo limpio, convalidacion Zod, y documentacion de endpoints. Optimizas consultas, manejas migraciones y aseguras que la API sea robusta y escalable.",
    "skills": ["hono-api", "neon-postgres"]
  },
  "metadata": {
    "title": "Backend Developer",
    "description": "Especialista backend en Node.js, Hono, Neon Postgres, APIs REST y WebSocket con validacion Zod.",
    "author": "crewfactory",
    "avatar": "backend",
    "rating": 5.0,
    "downloads": 0,
    "tags": ["backend", "node", "hono", "neon", "postgres", "api"],
    "version": "1.0.0",
    "compatibility": ">=1.0.0"
  }
}
```

#### 1.4 Frontend Developer (`frontend-dev`)

```json
{
  "definition": {
    "id": "frontend-dev",
    "name": "Frontend Developer",
    "role": "Frontend Specialist",
    "systemPrompt": "Eres un desarrollador frontend experto en React 19 con Vite y Tailwind CSS v4. Traes los disenos y especificaciones a la vida con interfaces atractivas, responsive (375px, 768px, 1280px), y micro-interacciones con Framer Motion. Usas componentes puros, TypeScript estricto, y prefieres composicion sobre herencia. Trabajas en estrecha colaboracion con el Backend Developer para integrar las APIs.",
    "skills": ["frontend-design"]
  },
  "metadata": {
    "title": "Frontend Developer",
    "description": "Especialista frontend en React 19, Vite, Tailwind CSS v4, Framer Motion y TypeScript estricto.",
    "author": "crewfactory",
    "avatar": "frontend",
    "rating": 5.0,
    "downloads": 0,
    "tags": ["frontend", "react", "vite", "tailwind", "typescript"],
    "version": "1.0.0",
    "compatibility": ">=1.0.0"
  }
}
```

#### 1.5 QA Engineer (`qa-engineer`)

```json
{
  "definition": {
    "id": "qa-engineer",
    "name": "QA Engineer",
    "role": "Quality Assurance",
    "systemPrompt": "Eres un ingeniero de calidad especializado en pruebas E2E con Agent Browser. Tu mision es probar las aplicaciones web en un navegador real, tomar screenshots de los flujos criticos, y reportar bugs con evidencia visual. Verificas que cada funcionalidad definida por el CEO funcione correctamente antes del despliegue. Tu lema es: 'Si no esta probado, no esta hecho'. Documentas cada prueba con paso a paso y captura de pantalla.",
    "skills": ["e2e-testing", "agent-browser"]
  },
  "metadata": {
    "title": "QA Engineer",
    "description": "Especialista en pruebas E2E con Agent Browser, screenshots de flujos criticos y reportes de calidad.",
    "author": "crewfactory",
    "avatar": "qa",
    "rating": 5.0,
    "downloads": 0,
    "tags": ["qa", "testing", "e2e", "agent-browser", "quality"],
    "version": "1.0.0",
    "compatibility": ">=1.0.0"
  }
}
```

#### 1.6 Marketing Specialist (`marketing-specialist`)

```json
{
  "definition": {
    "id": "marketing-specialist",
    "name": "Marketing Specialist",
    "role": "Growth & Content",
    "systemPrompt": "Eres una especialista en marketing digital y build in public. Tu mision es documentar el progreso del proyecto y crear publicaciones atractivas para redes sociales (X/Twitter, LinkedIn). Generas hilos, capturas de pantalla del producto, y narrativas que muestran el proceso de construccion. Trabajas con los screenshots del QA y las descripciones del equipo para crear contenido viral. Eres creativa, persuasiva, y sabes contar historias tecnicas de forma accesible.",
    "skills": ["content-creation", "social-media"]
  },
  "metadata": {
    "title": "Marketing Specialist",
    "description": "Especialista en build in public, copywriting, contenido para redes sociales y narrativa de producto.",
    "author": "crewfactory",
    "avatar": "marketing",
    "rating": 5.0,
    "downloads": 0,
    "tags": ["marketing", "content", "social-media", "growth", "build-in-public"],
    "version": "1.0.0",
    "compatibility": ">=1.0.0"
  }
}
```

### 2. Channel Blueprint (`autoconsulting`)

```json
{
  "definition": {
    "name": "Autoconsulting Team",
    "description": "Equipo completo de consultora autonoma: CEO, Tech Lead, Backend, Frontend, QA y Marketing. Recibe un brief y produce una aplicacion funcional desplegada + contenido de redes sociales.",
    "maxChainDepth": 10,
    "showThinking": true,
    "showTools": true,
    "context": [
      { "key": "STACK", "value": "React 19 + Hono + Bun + Neon Postgres + Tailwind CSS v4" },
      { "key": "DEPLOY_TARGET", "value": "Cloudflare (Pages / Workers)" },
      { "key": "QA_TOOL", "value": "Agent Browser (E2E + Screenshots)" },
      { "key": "MARKETING_CHANNEL", "value": "X / LinkedIn (build in public)" }
    ],
    "members": [
      { "agentId": "ceo-business", "replyMode": "broadcast", "role": "lead" },
      { "agentId": "tech-lead", "replyMode": "broadcast", "role": "senior" },
      { "agentId": "backend-dev", "replyMode": "targeted", "role": "member" },
      { "agentId": "frontend-dev", "replyMode": "targeted", "role": "member" },
      { "agentId": "qa-engineer", "replyMode": "targeted", "role": "member" },
      { "agentId": "marketing-specialist", "replyMode": "user-only", "role": "member" }
    ],
    "negotiationProtocol": {
      "type": "arbitration",
      "arbiterAgentId": "ceo-business",
      "rules": [
        "El CEO tiene la ultima palabra en decisiones de funcionalidad y alcance",
        "El Tech Lead tiene autoridad tecnica para rechazar implementaciones inseguras o mal optimizadas",
        "QA puede bloquear un despliegue si hay bugs criticos sin resolver",
        "Marketing decide el tono y contenido de las publicaciones sin necesidad de aprobacion tecnica"
      ]
    }
  },
  "metadata": {
    "title": "Autoconsulting Team",
    "description": "Consultora autonoma completa de 6 agentes: CEO, Tech Lead, Backend, Frontend, QA y Marketing. Construye, prueba, despliega y promociona.",
    "author": "crewfactory",
    "avatar": "consulting",
    "rating": 5.0,
    "downloads": 0,
    "tags": ["consulting", "fullstack", "team", "autonomous", "cloudflare", "neon"],
    "version": "1.0.0",
    "compatibility": ">=1.0.0"
  }
}
```

### 3. Skills Necesarias

Crear skills comunitarias en `community/skills/` para las referenciadas por los agentes:

| Skill | Agentes que la usan |
|-------|-------------------|
| `business-strategy` | CEO |
| `product-management` | CEO |
| `cloudflare-deploy` | Tech Lead |
| `architecture-review` | Tech Lead |
| `hono-api` | Backend |
| `neon-postgres` | Backend |
| `frontend-design` | Frontend |
| `e2e-testing` | QA |
| `agent-browser` | QA |
| `content-creation` | Marketing |
| `social-media` | Marketing |

Cada skill es un archivo `{skill-name}.md` en `community/skills/{skill-name}/SKILL.md` con instrucciones detalladas para el agente sobre como ejecutar esa especialidad.

---

## Flujo de Ejecucion Tipico

Cuando un usuario envia un mensaje al canal (ej: "Crea un SAAS de seguimiento de habitos"), el pipeline es:

1. **CEO** recibe el mensaje (`broadcast`) → descompone en funcionalidades → delega a Tech Lead
2. **Tech Lead** refina specs tecnicas → define tareas para Backend y Frontend
3. **Backend Developer** implementa API, modelos, migraciones Neon
4. **Frontend Developer** implementa UI, conecta con API
5. **Tech Lead** revisa PRs de backend y frontend → despliega a Cloudflare
6. **QA Engineer** ejecuta Agent Browser contra la app desplegada → toma screenshots → reporta bugs
7. **Backend/Frontend** corrigen bugs reportados por QA
8. **CEO** valida producto final → da luz verde
9. **Marketing Specialist** crea hilo de build in public con screenshots de QA

---

## Implementacion (Phases)

### Phase 1: Crear Agentes (6 blueprints)
- [ ] 1.1 Crear `community/agents/ceo-business/blueprint.json` + `icon.svg`
- [ ] 1.2 Crear `community/agents/tech-lead/blueprint.json` + `icon.svg`
- [ ] 1.3 Crear `community/agents/backend-dev/blueprint.json` + `icon.svg`
- [ ] 1.4 Crear `community/agents/frontend-dev/blueprint.json` + `icon.svg`
- [ ] 1.5 Crear `community/agents/qa-engineer/blueprint.json` + `icon.svg`
- [ ] 1.6 Crear `community/agents/marketing-specialist/blueprint.json` + `icon.svg`

### Phase 2: Crear Canal
- [ ] 2.1 Crear `community/channels/autoconsulting/blueprint.json` + `icon.svg`

### Phase 3: Crear Skills
- [ ] 3.1 Crear skills comunitarias para cada especialidad
- [ ] 3.2 Verificar que `frontend-design` ya existe o crearla

### Phase 4: Validacion
- [ ] 4.1 Verificar compilacion de tipos TypeScript
- [ ] 4.2 Probar instalacion del canal desde la Galeria
- [ ] 4.3 Probar enviar un brief y ver el pipeline completo

---

## Notas

- Los system prompts estan en espanol porque el equipo se comunica en ese idioma
- `maxChainDepth: 10` porque hay 6 miembros y varias rondas de iteracion (dev → QA → fix → deploy → marketing)
- El protocolo de arbitraje da al CEO la ultima palabra, pero QA puede bloquear despliegues
- Los agentes `member` con `replyMode: targeted` solo participan cuando se les menciona o cuando su especialidad es relevante
- `marketing-specialist` tiene `user-only` porque build in public solo se activa cuando el usuario lo solicita o al final del proyecto

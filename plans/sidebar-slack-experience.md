# Plan de Diseño: Experiencia de Navegación Estilo Slack y Sesiones Desplegables

Este plan detalla la propuesta para reorganizar la interfaz de usuario de CrewFactory, moviendo la navegación principal a una estructura de acordiones en la barra lateral e implementando un selector de sesiones dinámico en un menú desplegable/panel en el lado derecho.

---

## 1. Motivación y Objetivos

Actualmente, CrewFactory tiene un sidebar izquierdo que combina accesos directos, un selector de contexto superior y una lista de sesiones filtradas. A medida que el número de proyectos (repositorios), agentes y canales crece, navegar entre ellos requiere ir a páginas administrativas dedicadas (`/projects`, `/agents`, `/channels`), lo cual rompe el flujo de trabajo continuo y la inmediatez de la experiencia.

Inspirándonos en la experiencia de **Slack** y plataformas de mensajería/colaboración modernas, proponemos:
1. **Consolidar la navegación contextual directamente en la barra lateral izquierda** mediante acordeones colapsables para **Proyectos**, **Agentes** y **Canales**.
2. **Despejar la barra lateral izquierda del listado de sesiones**, moviéndolas a un menú desplegable interactivo o panel lateral deslizante en el **lado derecho** (o área superior derecha de la pantalla).
3. **Optimizar la navegación**, permitiendo cambiar de contexto (ej. saltar a un agente o a un canal) con un solo clic desde cualquier lugar de la aplicación.

---

## 2. Propuesta de Diseño de Interfaz

### 2.1 Barra Lateral Izquierda (Navegación Unificada)
La barra lateral izquierda se convertirá en el centro de control de contextos de CrewFactory:

- **Sección Superior (Global & Shortcuts):**
  - Un botón prominente para volver al **Contexto Global** (limpiar contexto).
  - Enlaces directos a páginas principales: **Chat Activo**, **Workspace (File Explorer)**, **Preview** (si hay repo activo).
- **Acordeón: 📁 Proyectos (Repositorios):**
  - Lista de los repositorios del usuario.
  - Indicador visual del repositorio actualmente seleccionado.
  - Botón rápido `+` para clonar o crear un nuevo repositorio sin salir del chat.
- **Acordeón: 🤖 Agentes Programáticos:**
  - Lista de los agentes del usuario (`Agent: Coder`, `Agent: Writer`, etc.).
  - Botón rápido `+` para crear un nuevo agente.
- **Acordeón: 💬 Canales (Teams):**
  - Lista de canales multi-agente (`#general`, `#marketing`, etc.).
  - Botón rápido `+` para crear un nuevo canal.
- **Sección Inferior:**
  - Accesos directos compactos a **Ajustes** y **Skills**.

### 2.2 Panel de Sesiones Desplegable (Lado Derecho)
Dado que las sesiones son específicas del contexto seleccionado, se removerán de la barra lateral izquierda y se accederá a ellas bajo demanda:

- **Acceso:** Un botón en el header superior derecho o en la parte superior del ChatArea (ej. `Historial de Sesiones` o `Sesiones (N)` con un icono de reloj/chat).
- **Comportamiento al Clicar:**
  - **Opción Dropdown:** Despliega un menú flotante en la esquina superior derecha con la lista de sesiones.
  - **Opción Drawer (Recomendada por Premium UI):** Desliza un panel lateral derecho limpio y suave (`w-80`) sobre la interfaz de chat, similar a la bandeja de tareas actuales, que muestra:
    - Botón "+ Nueva Sesión" (adaptado al contexto actual).
    - Lista de sesiones con su contador de mensajes, estado en vivo (active, streaming, sleeping) y botón para borrar sesión con confirmación.
    - Se cierra haciendo clic fuera o con un botón `x`.

---

## 3. Enfoque Técnico Sugerido

### 3.1 Cliente (React / Tailwind)

1. **Estado Compartido:**
   - Aprovechar los hooks/contextos existentes en la aplicación (`useWebSocket`, `useRouter`, etc.).
   - Mantener el listado de repositorios, agentes y canales en estados accesibles para que la barra lateral los renderice directamente en los acordeones sin necesidad de montar páginas completas.

2. **Componente `SessionSidebar` Rediseñado:**
   - Eliminar el listado de sesiones de su render principal.
   - Implementar el fetch de repositorios (`GET /api/workspace-repos`), agentes (`GET /api/agents`) y canales (`GET /api/channels`) al montar el sidebar.
   - Diseñar las secciones colapsables (acordeones) usando estados locales de React (`isOpenRepos`, `isOpenAgents`, `isOpenChannels`) con animaciones de transición suaves usando Framer Motion o clases de Tailwind (`transition-all duration-300`).

3. **Nuevo Componente `RightSessionDrawer` o `SessionDropdown`:**
   - Crear un componente dedicado para el manejo de sesiones en el lado derecho.
   - Conectar este componente al estado de sesiones del contexto activo.
   - Renderizar el disparador del panel en `MainLayout.tsx` (en la barra superior derecha, que actualmente está vacía).

### 3.2 Backend (Hono / API)
No se requieren cambios estructurales en el backend, ya que los endpoints de sesiones, agentes, canales y repositorios ya están implementados y consolidados:
- `GET /api/sessions`
- `GET /api/agents`
- `GET /api/channels`
- `GET /api/workspace-repos`

---

## 4. Alternativas y Trade-offs

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| **A. Desplegable (Dropdown) Superior Derecho** | Muy compacto, no ocupa espacio horizontal en pantallas medianas/pequeñas, ideal para cambios rápidos de sesión. | Espacio de visualización limitado para nombres de sesión largos y metadatos (como contador de mensajes y estados). |
| **B. Panel Deslizable (Drawer) Derecho (Recomendada)** | Interfaz más limpia e intuitiva, espacio cómodo para metadatos, acciones claras de creación/eliminación de sesiones, experiencia coherente con el panel de tareas. | Ocupa espacio visual temporalmente sobre el chat o workspace al estar abierto. |

---

## 5. Próximos Pasos Propuestos

1. **Aprobación del Plan:** Validar con el usuario si prefiere la opción de menú desplegable o panel deslizante (Drawer) para las sesiones.
2. **Implementación del Sidebar:** Modificar `SessionSidebar.tsx` para incorporar las llamadas a la API de repositorios, agentes y canales, y renderizar los acordeones con sus botones de creación rápida.
3. **Creación del Panel de Sesiones:** Construir el componente desplegable/drawer derecho y conectarlo con `MainLayout.tsx`.
4. **Verificación:** Probar que el cambio de contexto entre proyectos, agentes y canales a través del sidebar funcione correctamente y actualice el panel de sesiones en tiempo real.

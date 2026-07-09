# Thinking Preview Line

Mostrar una linea animada con el contenido del thinking del agente cuando el acordeon de pensamiento esta cerrado, para que el usuario pueda ver al menos un preview de lo que el agente esta razonando sin tener que abrir el bloque completo.

## Problema

Actualmente `ThinkingBlock` en `apps/client/src/components/chat/MessageBlocks.tsx` oculta completamente el contenido cuando el acordeon esta cerrado (`{open && (...)}`). Esto obliga al usuario a abrir manualmente el acordeon cada vez que quiere ver el progreso del razonamiento.

## Solucion Propuesta

Cuando el acordeon esta cerrado, mostrar una linea unica (single-line) con el ultimo fragmento del thinking, animada con un efecto de marquee/scroll si es muy larga, y con un fondo sutil que indique que hay contenido oculto.

### Comportamiento especifico:

1. **Estado cerrado (default):**
   - Mostrar la primera linea o los ultimos ~80 caracteres del thinking en una sola linea
   - Efecto de fade-out al final de la linea si el contenido es mas largo (overflow gradient)
   - Background sutil (`bg-primary/5` o similar) para distinguirlo del contenido normal
   - El texto debe ser de la misma familia mono que el contenido del thinking, pero con opacidad reducida (text-muted-foreground/70)
   - Al hacer click en la linea preview, se abre el acordeon completo

2. **Estado abierto:**
   - Comportamiento actual sin cambios (contenido completo con scroll)
   - Click en el header "Hide reasoning" para cerrar

3. **Streaming:**
   - Mientras el agente esta generando, la preview line debe actualizarse en tiempo real
   - Efecto de `animate-pulse` sutil en el borde izquierdo (`border-l-2`) para indicar actividad

### Archivos a modificar:

- `apps/client/src/components/chat/MessageBlocks.tsx` — `ThinkingBlock` component
  - Anadir estado `preview` que muestra el texto truncado cuando `!open`
  - Usar `useEffect` para actualizar el preview cuando `thinking` cambia (streaming)
  - Animar con Tailwind classes (transition, pulse, truncate)
  - Mantener el boton de toggle pero mas compacto (sin "Show reasoning" text, solo icono + preview)

### Diseno visual

```
[⚡] Implementing the data fetch layer with proper error handling and cache invalidation strategies...
[______________________________]

Estado cerrado:
- Borde izquierdo `border-l-2 border-primary/20`
- Texto mono `text-[11px]` truncado con fade
- "⚡" icono de rayo (svg) con `animate-pulse` durante streaming
- Cursor pointer, hover:bg-primary/5

Estado abierto:
- Sin cambios respecto al actual
```

### Consideraciones

- No usar librerias externas (solo Tailwind CSS v4 y clases nativas)
- No romper la accesibilidad: el preview debe ser clickeable y el acordeon debe abrirse completamente
- El preview debe funcionar tanto en sesiones directas como en canales multi-agente
- No afectar el rendimiento: evitar re-renders innecesarios, solo actualizar cuando `thinking` cambie

# Fix: Eager Experiments Fetch en `/onboard` y `/`

## Problema

`AppRouter` (`apps/client/src/components/layout/AppRouter.tsx:200-202`) ejecuta `fetchExperiments()` en un `useEffect` **sin ningun guard**, disparando `GET /api/experiments` en **todas** las rutas, incluyendo `/onboard` (usuario no existe) y `/` / `/login` (usuario no autenticado). Esto produce requests HTTP 401 innecesarios.

Ademas, `SessionSidebar.tsx:192-197` fetchea el mismo endpoint independientemente, creando una **doble carga** de datos cuando la sidebar se monta.

Otras entidades del sistema (agentes, canales, proyectos) siguen el patron correcto: fetcheo **lazy** solo cuando su pagina especifica se renderiza (`AgentsPage`, `ChannelsPage`, `DashboardPage`), via hooks dedicados (`useAgents`, `useChannels`).

## Arquitectura Actual

```
AppRouter (useEffect global -> fetchExperiments -> state experiments)
  ├── MainLayout (lab={{experiments, ...}})
  │     └── SessionSidebar (fetchExperiments propio -> state local)
  ├── LaboratoryPage (recibe experiments + setExperiments como props)
  ├── ExperimentDetailPage (recibe experiments + setExperiments como props)
  └── Modals: delete, run, export, judge (en AppRouter, usan experiments state)
```

El estado `experiments` esta elevado a `AppRouter` porque:
- Los modales (delete/run/export) necesitan acceso al experimento seleccionado
- La lista se comparte entre sidebar, laboratorio y detalle

## Solucion Propuesta (4 fases)

### Fase 1: Auth Guard + Route Guard (Minimal Fix)

**Archivo:** `apps/client/src/components/layout/AppRouter.tsx`

**Cambio:** Agregar `if (!user) return;` al `useEffect` existente:

```tsx
useEffect(() => {
  if (!user) return;
  fetchExperiments();
}, [fetchExperiments, user]);
```

**Por que funciona:**
- `/onboard` → `needsSetup=true` → AppRouter retorna `OnboardingPage` antes de MainLayout → `user` es null → no hay fetch
- `/login` → `!user` → AppRouter retorna `LoginPage` → `user` es null → no hay fetch
- Cualquier pagina autenticada → `user` existe → fetch normal

**Riesgo:** Bajo. No cambia comportamiento post-login.

---

### Fase 2: Hook `useExperiments` (Arquitectura)

**Archivo nuevo:** `apps/client/src/hooks/useExperiments.ts`

**Patron:** Identico a `useAgents` / `useChannels`:

```tsx
export function useExperiments() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExperiments = useCallback(async () => { ... fetch /api/experiments ... }, []);

  useEffect(() => { fetchExperiments(); }, [fetchExperiments]);

  const createExperiment = useCallback(async (data: CreateExperiment) => { ... }, [fetchExperiments]);
  const updateExperiment = useCallback(async (id: string, data: UpdateExperiment) => { ... }, [fetchExperiments]);
  const deleteExperiment = useCallback(async (id: string) => { ... }, [fetchExperiments]);

  return { experiments, loading, error, fetchExperiments, createExperiment, updateExperiment, deleteExperiment };
}
```

**Beneficio:** Centraliza la logica CRUD, elimina codigo duplicado entre AppRouter, SessionSidebar y futuros consumidores.

---

### Fase 3: Migrar Laboratorio al Hook

**Archivos:**
- `apps/client/src/pages/LaboratoryPage.tsx`
- `apps/client/src/pages/ExperimentDetailPage.tsx`

**Cambio:** Consumir `useExperiments` en lugar de recibir `experiments` y `setExperiments` como props. Las paginas se vuelven autosuficientes.

**AppRouter** deja de pasar `experiments`/`setExperiments` como props a estas paginas, simplificando su interface.

---

### Fase 4: Deduplicar SessionSidebar

**Archivo:** `apps/client/src/components/sidebar/SessionSidebar.tsx`

**Opcion A (Recomendada):** Consumir `useExperiments` hook, reemplazando `fetchExperiments` + `setExperiments` locales. El hook se encarga del fetching y estado. Unica fuente de verdad.

**Opcion B (Lightweight):** Mantener fetch propio pero deduplicar el payload usando search params opcionales (`?fields=id,name,status`) si el backend lo soporta, o cachear con una key global para evitar requests simultaneos.

**Opcion C (Props):** Pasar `experiments` como prop desde AppRouter (via MainLayout), eliminando el fetch interno de la sidebar. Esto acopla la sidebar al AppRouter pero elimina la duplicacion.

**Recomendacion:** Opcion A — consistente con el patron del codigo base.

---

## Eliminacion de Duplicacion Post-Fase 4

```
AppRouter (guarda auth, state experiments preservado para modales)
  ├── MainLayout (data flow simplificado)
  │     └── SessionSidebar (usa useExperiments hook)
  ├── LaboratoryPage (usa useExperiments hook)
  └── ExperimentDetailPage (usa useExperiments hook)
  Modales: delete, run, export, judge (permanecen en AppRouter, reciben exp via props)
```

---

## Criterios de Exito

1. `GET /api/experiments` **no** se dispara en `/onboard` ni `/login`
2. Ningun cambio funcional en rutas autenticadas
3. No hay mas de 1 fetch simultaneo de `/api/experiments` por sesion (sidebar + lab)
4. TypeScript typecheck y builds exitosos (`bun run build`)
5. Layout responsivo y modales funcionan correctamente

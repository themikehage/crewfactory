# Fix: Experiment Storage Path Discrepancy

**Tipo:** Bug Fix

## Problema

Los experimentos se guardan en `{DATA}/{username}/experiments/` mientras que todo el resto de entidades (agentes, canales, proyectos, sesiones, custom-tools) se guardan bajo `{DATA}/users/{username}/...`.

## Causa Raiz

`apps/server/src/laboratory/experiment-store.ts:10` construye la ruta directamente desde `CREWFACTORY_DATA_PATH()`:

```ts
const dir = join(BASE_DIR, username, "experiments");
// → /app/data/Therry/experiments
```

mientras que el helper compartido en `packages/shared/src/paths.ts:99` incluye el segmento `users/`:

```ts
export function getExperimentsDir(username: string): string {
  return join(getUserDir(username), EXPERIMENTS_DIR);
  // getUserDir → join(CREWFACTORY_DATA_PATH(), USERS_DIR, username)
  // → /app/data/users/Therry/experiments
}
```

`ExperimentStore` tiene su propia implementacion de `getExperimentsDir()` que se salta el `USERS_DIR`.

## Impacto

- Experimentos escritos en `{DATA}/{username}/experiments/` — no migran si se monta volumen en `{DATA}/users/`
- `ensureAllDirs()` crea `{DATA}/users/{username}/experiments/` pero nada lo usa — directorio muerto
- Confusion en backups, volumenes Docker, y navegacion del filesystem

## Fix

Reemplazar la implementacion local en `ExperimentStore.getExperimentsDir()` con la funcion compartida de `packages/shared/src/paths.ts`. Opciones:

1. **Directo:** cambiar line 10 de `join(BASE_DIR, username, "experiments")` a `join(BASE_DIR, USERS_DIR, username, "experiments")`
2. **Mejor:** importar y usar `getExperimentsDir(username)` de `@shared/paths` (ya existe y es correcta)

Opcion 2 es preferible porque elimina la duplicacion de logica de paths.

## Migracion

Si ya existen experimentos en la ruta incorrecta, moverlos a la correcta:

```bash
mv /app/data/Therry/experiments /app/data/users/Therry/experiments
```

## Archivos Afectados

| Archivo | Linea | Cambio |
|---|---|---|
| `apps/server/src/laboratory/experiment-store.ts` | 6-15 | Eliminar `BASE_DIR` local y `getExperimentsDir()` propio; importar `getExperimentsDir` de `@shared/paths` |

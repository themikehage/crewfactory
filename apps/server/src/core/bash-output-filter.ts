export function filterSecretsFromOutput(
  output: string,
  secrets: string[]
): string {
  if (!output || !secrets || secrets.length === 0) return output;

  // Filtrar duplicados, valores vacíos y secrets extremadamente cortos (menores a 4 caracteres)
  // para evitar falsos positivos con cadenas comunes.
  const uniqueSecrets = Array.from(new Set(secrets))
    .filter((s): s is string => typeof s === "string" && s.trim().length >= 4);

  if (uniqueSecrets.length === 0) return output;

  // Optimización para outputs gigantescos: hacer un chequeo rápido con includes
  // antes de correr regex costosas.
  let hasAnyMatch = false;
  for (const secret of uniqueSecrets) {
    if (output.includes(secret)) {
      hasAnyMatch = true;
      break;
    }
  }

  if (!hasAnyMatch) return output;

  // Ordenar de más larga a más corta para evitar reemplazos parciales
  const sortedSecrets = uniqueSecrets.sort((a, b) => b.length - a.length);

  let filtered = output;
  for (const secret of sortedSecrets) {
    // Escapar caracteres especiales para regex
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filtered = filtered.replace(new RegExp(escaped, "g"), "***hidden***");
  }

  return filtered;
}

import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Environment Variables",
    subtitle: "Manage environment variables for your workspace.",
    noVars: "No environment variables configured.",
    standardView: "Standard View",
    developerView: "Developer View",
    hideSecrets: "Hide Secrets",
    revealSecrets: "Reveal Secrets",
    saveChanges: "Save Changes",
    enterValue: "Enter value",
  },
  es: {
    title: "Variables de Entorno",
    subtitle: "Gestiona las variables de entorno de tu workspace.",
    noVars: "No hay variables de entorno configuradas.",
    standardView: "Vista Estandar",
    developerView: "Vista de Desarrollador",
    hideSecrets: "Ocultar Secretos",
    revealSecrets: "Revelar Secretos",
    saveChanges: "Guardar Cambios",
    enterValue: "Ingresa un valor",
  },
};

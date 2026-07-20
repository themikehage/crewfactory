import type { SupportedLocale } from "@/lib/types";

export const literals = {
  es: {
    title: "Crear Proyecto",
    subtitle: "Crea un proyecto local o clona uno existente desde GitHub",
    projectNameLabel: "Nombre del Proyecto",
    projectNamePlaceholder: "mi-proyecto",
    cloneUrlLabel: "URL de clonado (opcional)",
    cloneUrlPlaceholder: "https://github.com/usuario/repo.git",
    avatarUrlLabel: "URL del Avatar (opcional)",
    cancel: "Cancelar",
    create: "Crear Proyecto",
    creating: "Creando...",
    createError: "Error al crear el proyecto",
  },
  en: {
    title: "Create Project",
    subtitle: "Create a local project or clone an existing one from GitHub",
    projectNameLabel: "Project Name",
    projectNamePlaceholder: "my-project",
    cloneUrlLabel: "Clone URL (optional)",
    cloneUrlPlaceholder: "https://github.com/user/repo.git",
    avatarUrlLabel: "Avatar URL (optional)",
    cancel: "Cancel",
    create: "Create Project",
    creating: "Creating...",
    createError: "Failed to create project",
  },
} satisfies Record<SupportedLocale, Record<string, string>>;

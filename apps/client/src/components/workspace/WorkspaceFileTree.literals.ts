import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    newFile: "New File",
    newFolder: "New Folder",
    rename: "Rename",
    delete: "Delete",
  },
  es: {
    newFile: "Nuevo Archivo",
    newFolder: "Nueva Carpeta",
    rename: "Renombrar",
    delete: "Eliminar",
  },
};

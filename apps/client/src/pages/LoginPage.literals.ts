import type { LiteralsRecord } from "@/lib";

export const literals = {
  en: {
    title: "Crew Factory",
    subtitle: "Coding agent interface",
    usernamePlaceholder: "Username",
    passwordPlaceholder: "Password",
    signIn: "Sign In",
    signingIn: "Signing in...",
    loginFailed: "Login failed",
  },
  es: {
    title: "Crew Factory",
    subtitle: "Interfaz de agente de codificacion",
    usernamePlaceholder: "Usuario",
    passwordPlaceholder: "Contrasena",
    signIn: "Iniciar Sesion",
    signingIn: "Iniciando sesion...",
    loginFailed: "Error al iniciar sesion",
  },
} satisfies LiteralsRecord;

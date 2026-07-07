import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    labelApproval: "approval",
    labelQuestion: "question",
    labelImages: "images",
    labelHtml: "html",
    labelChart: "chart",
    labelRefresh: "refresh",
    labelSubagent: "subagent",
    labelDelegation: "delegation",
    
    argApprovalRequest: "Approval Request",
    argUserQuestion: "User Question",
    argImages: "images",
    argChart: "Chart",
    argHtmlDoc: "HTML document",
    argUiRefresh: "UI refresh",
    
    resWaiting: "waiting...",
    resRendered: "rendered",
    resShared: "shared",
    resRefreshed: "refreshed",
    resCompleted: "completed",
    
    bodySubagentConsole: "Subagent Console",
    bodyViewLiveConsole: "View Live Console",
    bodyWorkspaceRefreshed: "Workspace sections refreshed: ",
    bodyDelegationTo: "Delegation to",
  },
  es: {
    labelApproval: "aprobación",
    labelQuestion: "pregunta",
    labelImages: "imágenes",
    labelHtml: "html",
    labelChart: "gráfico",
    labelRefresh: "refrescar",
    labelSubagent: "subagente",
    labelDelegation: "delegación",
    
    argApprovalRequest: "Petición de aprobación",
    argUserQuestion: "Pregunta al usuario",
    argImages: "imágenes",
    argChart: "Gráfico",
    argHtmlDoc: "documento HTML",
    argUiRefresh: "refresco de UI",
    
    resWaiting: "esperando...",
    resRendered: "renderizado",
    resShared: "compartido",
    resRefreshed: "refrescado",
    resCompleted: "completado",
    
    bodySubagentConsole: "Subagente Consola",
    bodyViewLiveConsole: "Ver Consola en Vivo",
    bodyWorkspaceRefreshed: "Secciones del espacio de trabajo refrescadas: ",
    bodyDelegationTo: "Delegación a",
  },
};

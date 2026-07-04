import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    levelSenior: "Senior",
    levelMember: "Member",
    levelObserver: "Observer",
    replyBroadcast: "Broadcast",
    replyTargeted: "Targeted",
    replyUserOnly: "User-only",
    replyMentionOnly: "Mention-only",
  },
  es: {
    levelSenior: "Senior",
    levelMember: "Miembro",
    levelObserver: "Observador",
    replyBroadcast: "Broadcast",
    replyTargeted: "Dirigido",
    replyUserOnly: "Solo usuario",
    replyMentionOnly: "Solo mencion",
  },
};

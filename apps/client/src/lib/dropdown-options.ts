export const ROLE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "senior", label: "Senior" },
  { value: "member", label: "Member" },
  { value: "observer", label: "Observer" },
] as const;

export const REPLY_MODE_OPTIONS = [
  { value: "user-only", label: "User-only" },
  { value: "broadcast", label: "Broadcast" },
  { value: "targeted", label: "Targeted" },
  { value: "mention-only", label: "Mention-only" },
] as const;

export const LOG_SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "session", label: "Sessions" },
  { value: "channel", label: "Channels" },
] as const;

export const IMPORT_MODE_OPTIONS = [
  { value: "merge", label: "Merge (Keep current, update matching)" },
  { value: "overwrite", label: "Overwrite (Wipe all data, restore zip)" },
] as const;

import { useState } from "react";
import { motion } from "framer-motion";
import type { ChannelMember, ChannelRole, ReplyMode } from "shared";

const ROLE_CONFIG: Record<ChannelRole, {
  label: string;
  order: number;
  badgeClass: string;
  borderClass: string;
  shadowClass: string;
  accentBarClass: string;
  opacityClass: string;
}> = {
  lead: {
    label: "Lead",
    order: 0,
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    borderClass: "border-primary/30",
    shadowClass: "shadow-lg shadow-accent/5",
    accentBarClass: "bg-primary",
    opacityClass: "",
  },
  senior: {
    label: "Senior",
    order: 1,
    badgeClass: "bg-primary/10 text-primary/80 border-primary/15",
    borderClass: "border-primary/20",
    shadowClass: "shadow-md shadow-accent/[0.03]",
    accentBarClass: "bg-primary/60",
    opacityClass: "",
  },
  member: {
    label: "Member",
    order: 2,
    badgeClass: "bg-card-hover text-muted-foreground border-input",
    borderClass: "border-input",
    shadowClass: "",
    accentBarClass: "bg-card-hover",
    opacityClass: "",
  },
  observer: {
    label: "Observer",
    order: 3,
    badgeClass: "bg-background text-muted-foreground border-input/50",
    borderClass: "border-dashed border-input/50",
    shadowClass: "",
    accentBarClass: "bg-transparent",
    opacityClass: "opacity-60 hover:opacity-100",
  },
};

const REPLY_MODE_ICONS: Record<ReplyMode, { icon: string; label: string }> = {
  broadcast: { icon: "M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z", label: "Broadcast" },
  targeted: { icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", label: "Targeted" },
  "user-only": { icon: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z", label: "User-only" },
  "mention-only": { icon: "M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5", label: "Mention-only" },
};

interface Props {
  member: ChannelMember;
  name: string;
  role: string;
  skillCount: number;
  skills: string[];
  animationDelay: number;
}

export function OrgChartCard({ member, name, role, skillCount, skills, animationDelay }: Props) {
const [showTooltip, setShowTooltip] = useState(false);
  const cfg = ROLE_CONFIG[member.role as ChannelRole] ?? ROLE_CONFIG.member;
  const replyModeIcon = REPLY_MODE_ICONS[member.replyMode];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: animationDelay, ease: "easeOut" }}
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        className={`bg-card border rounded-xl p-3 cursor-default select-none ${cfg.borderClass} ${cfg.shadowClass} ${cfg.opacityClass} transition-colors`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${cfg.accentBarClass}`} />

        <div className="flex items-start justify-between gap-1.5 pl-1">
          <span className="font-semibold text-foreground text-xs truncate">
            {name}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border flex-shrink-0 ${cfg.badgeClass}`}>
            {cfg.label}
          </span>
        </div>

        <span className="text-xs text-muted-foreground font-mono truncate block mt-0.5 pl-1">
          {role}
        </span>

        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-input/40 pl-1">
          {replyModeIcon && (
            <span className="flex items-center gap-1" title={replyModeIcon.label}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
                <path d={replyModeIcon.icon} fillRule="evenodd" clipRule="evenodd" />
              </svg>
              <span>{replyModeIcon.label}</span>
            </span>
          )}
          {skillCount > 0 && (
            <span className="bg-background/50 px-1.5 py-0.5 rounded border border-input">
              {skillCount} skills
            </span>
          )}
        </div>

        {showTooltip && skills.length > 0 && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-card border border-input rounded-lg p-2.5 shadow-xl z-50 w-48 pointer-events-none">
            <p className="text-xs font-semibold text-foreground truncate">{name}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-tight">
              <span className="text-foreground font-medium">Skills:</span>{" "}
              {skills.join(", ")}
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

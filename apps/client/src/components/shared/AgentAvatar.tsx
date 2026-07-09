import { useMemo, useState } from "react";
import type { FC } from "react";
import { getAvatarComponent, isDefaultAvatar } from "@/lib/defaultAvatars";

function getToken() {
  return localStorage.getItem("token") || "";
}

interface AgentAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 40,
};

const TEXT_SIZE_MAP = {
  xs: "text-[7px]",
  sm: "text-[9px]",
  md: "text-xs",
  lg: "text-sm",
};

export const AgentAvatar: FC<AgentAvatarProps> = ({
  name,
  avatarUrl,
  size = "md",
  className = "",
}) => {
  const [imgError, setImgError] = useState(false);
  const px = SIZE_MAP[size];

  const authedUrl = useMemo(() => {
    if (!avatarUrl) return "";
    if (isDefaultAvatar(avatarUrl)) return avatarUrl;
    const token = getToken();
    if (!token || !avatarUrl.startsWith("/api/")) return avatarUrl;
    return `${avatarUrl}?token=${encodeURIComponent(token)}`;
  }, [avatarUrl]);

  if (avatarUrl && !isDefaultAvatar(avatarUrl) && !imgError) {
    return (
      <div
        className={`rounded-full overflow-hidden flex-shrink-0 bg-card border border-input ${className}`}
        style={{ width: px, height: px }}
      >
        <img
          src={authedUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  const SvgComponent = getAvatarComponent(avatarUrl, name);

  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0 bg-card ${className}`}
      style={{ width: px, height: px }}
    >
      <SvgComponent width={px} height={px} viewBox="0 0 40 40" />
    </div>
  );
};

export const AgentAvatarWithFallback: FC<AgentAvatarProps> = (props) => {
  const { name, size = "md", className = "" } = props;
  const px = SIZE_MAP[size];

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 ${TEXT_SIZE_MAP[size]} font-bold text-primary ${className}`}
      style={{ width: px, height: px }}
    >
      {initials}
    </div>
  );
};

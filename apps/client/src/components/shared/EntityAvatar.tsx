import { useMemo, useState } from "react";
import type { FC } from "react";
import { getAvatarComponent, isDefaultAvatar } from "@/lib/defaultAvatars";

interface EntityAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
  className?: string;
  type?: "project" | "agent" | "channel";
}

const SIZE_MAP = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
  "2xl": 64,
  "3xl": 112,
  full: "100%" as any,
};

const TEXT_SIZE_MAP = {
  xs: "text-[7px]",
  sm: "text-[9px]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-base",
  "2xl": "text-lg",
  "3xl": "text-2xl",
  full: "text-3xl",
};

export const EntityAvatar: FC<EntityAvatarProps> = ({
  name,
  avatarUrl,
  size = "md",
  className = "",
  type = "project",
}) => {
  const [imgError, setImgError] = useState(false);
  const px = SIZE_MAP[size];

  const gradientStyle = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 40) % 360;
    
    let s = 65;
    let l = 45;
    if (type === "channel") {
      s = 70;
      l = 50;
    } else if (type === "agent") {
      s = 60;
      l = 40;
    }

    return {
      background: `linear-gradient(135deg, hsl(${h1}, ${s}%, ${l}%), hsl(${h2}, ${s}%, ${l - 15}%))`,
    };
  }, [name, type]);

  const initials = useMemo(() => {
    return name
      .split(/[\s_-]+/)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [name]);

  if (avatarUrl && !isDefaultAvatar(avatarUrl) && !imgError) {
    return (
      <div
        className={`overflow-hidden flex-shrink-0 bg-card border border-input/30 shadow-sm ${
          type === "agent" ? "rounded-full" : "rounded-xl"
        } ${className}`}
        style={{ width: px, height: px }}
      >
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  if (avatarUrl && isDefaultAvatar(avatarUrl)) {
    const SvgComponent = getAvatarComponent(avatarUrl, name);
    return (
      <div
        className={`overflow-hidden flex-shrink-0 bg-card ${
          type === "agent" ? "rounded-full" : "rounded-xl"
        } ${className}`}
        style={{ width: px, height: px }}
      >
        <SvgComponent width={px} height={px} viewBox="0 0 40 40" />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 font-bold text-white tracking-wider border border-white/10 ${
        type === "agent" ? "rounded-full" : "rounded-xl"
      } ${TEXT_SIZE_MAP[size]} ${className}`}
      style={{ width: px, height: px, ...gradientStyle }}
    >
      {initials}
    </div>
  );
};

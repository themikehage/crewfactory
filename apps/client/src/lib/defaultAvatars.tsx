import { useId, type FC, type SVGProps } from "react";

type AvatarSvgProps = SVGProps<SVGSVGElement>;

const Robot1: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <rect x="8" y="12" width="24" height="20" rx="4" fill="#4ade80" />
    <rect x="12" y="18" width="5" height="5" rx="1" fill="#121212" />
    <rect x="23" y="18" width="5" height="5" rx="1" fill="#121212" />
    <rect x="15" y="26" width="10" height="2" rx="1" fill="#121212" />
    <rect x="18" y="6" width="4" height="6" rx="2" fill="#4ade80" />
  </svg>
);

const Robot2: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <circle cx="20" cy="22" r="12" fill="#60a5fa" />
    <circle cx="16" cy="20" r="2.5" fill="#121212" />
    <circle cx="24" cy="20" r="2.5" fill="#121212" />
    <path d="M15 27 Q20 30 25 27" stroke="#121212" strokeWidth="2" strokeLinecap="round" />
    <rect x="18" y="6" width="4" height="5" rx="2" fill="#60a5fa" />
    <circle cx="20" cy="6" r="2" fill="#60a5fa" />
  </svg>
);

const Robot3: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <rect x="10" y="14" width="20" height="18" rx="3" fill="#f472b6" />
    <rect x="14" y="19" width="4" height="4" rx="2" fill="#121212" />
    <rect x="22" y="19" width="4" height="4" rx="2" fill="#121212" />
    <rect x="16" y="27" width="8" height="2" rx="1" fill="#121212" />
    <line x1="20" y1="8" x2="20" y2="14" stroke="#f472b6" strokeWidth="3" strokeLinecap="round" />
    <circle cx="20" cy="7" r="2.5" fill="#f472b6" />
  </svg>
);

const Robot4: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <rect x="9" y="13" width="22" height="19" rx="5" fill="#fbbf24" />
    <circle cx="16" cy="21" r="3" fill="#121212" />
    <circle cx="24" cy="21" r="3" fill="#121212" />
    <circle cx="16" cy="20" r="1" fill="#fff" />
    <circle cx="24" cy="20" r="1" fill="#fff" />
    <path d="M17 28 L23 28" stroke="#121212" strokeWidth="2" strokeLinecap="round" />
    <rect x="17" y="7" width="6" height="6" rx="3" fill="#fbbf24" />
  </svg>
);

const Fox: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <path d="M8 16 L14 8 L16 16 Z" fill="#fb923c" />
    <path d="M32 16 L26 8 L24 16 Z" fill="#fb923c" />
    <circle cx="20" cy="22" r="11" fill="#fb923c" />
    <circle cx="16" cy="20" r="2" fill="#121212" />
    <circle cx="24" cy="20" r="2" fill="#121212" />
    <ellipse cx="20" cy="26" rx="3" ry="2" fill="#121212" />
  </svg>
);

const Owl: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <ellipse cx="20" cy="22" rx="12" ry="13" fill="#a78bfa" />
    <circle cx="15" cy="19" r="4" fill="#fff" />
    <circle cx="25" cy="19" r="4" fill="#fff" />
    <circle cx="15" cy="19" r="2" fill="#121212" />
    <circle cx="25" cy="19" r="2" fill="#121212" />
    <path d="M18 25 L20 27 L22 25" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 12 L14 16 L8 16 Z" fill="#a78bfa" />
    <path d="M30 12 L26 16 L32 16 Z" fill="#a78bfa" />
  </svg>
);

const Cat: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <path d="M9 18 L12 7 L17 15 Z" fill="#94a3b8" />
    <path d="M31 18 L28 7 L23 15 Z" fill="#94a3b8" />
    <circle cx="20" cy="23" r="11" fill="#94a3b8" />
    <ellipse cx="16" cy="21" rx="1.5" ry="2.5" fill="#22c55e" />
    <ellipse cx="24" cy="21" rx="1.5" ry="2.5" fill="#22c55e" />
    <ellipse cx="20" cy="26" rx="2" ry="1.5" fill="#f472b6" />
  </svg>
);

const Wolf: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <path d="M7 20 L11 6 L16 16 Z" fill="#64748b" />
    <path d="M33 20 L29 6 L24 16 Z" fill="#64748b" />
    <ellipse cx="20" cy="23" rx="12" ry="11" fill="#64748b" />
    <circle cx="16" cy="21" r="2" fill="#fbbf24" />
    <circle cx="24" cy="21" r="2" fill="#fbbf24" />
    <path d="M17 28 Q20 31 23 28" stroke="#121212" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const GeoHex: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <polygon points="20,6 32,13 32,27 20,34 8,27 8,13" fill="#06b6d4" />
    <polygon points="20,12 27,16 27,24 20,28 13,24 13,16" fill="#121212" opacity="0.3" />
    <circle cx="20" cy="20" r="3" fill="#fff" />
  </svg>
);

const GeoDiamond: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <rect x="8" y="8" width="24" height="24" rx="2" fill="#e879f9" transform="rotate(45 20 20)" />
    <rect x="14" y="14" width="12" height="12" rx="1" fill="#121212" opacity="0.25" transform="rotate(45 20 20)" />
    <circle cx="20" cy="20" r="3" fill="#fff" />
  </svg>
);

const GeoTriangle: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <polygon points="20,6 36,34 4,34" fill="#f97316" />
    <polygon points="20,14 30,30 10,30" fill="#121212" opacity="0.2" />
    <circle cx="20" cy="24" r="3" fill="#fff" />
  </svg>
);

const GeoStar: FC<AvatarSvgProps> = (props) => (
  <svg viewBox="0 0 40 40" fill="none" {...props}>
    <polygon points="20,4 24,15 36,15 27,22 30,34 20,27 10,34 13,22 4,15 16,15" fill="#facc15" />
    <circle cx="20" cy="20" r="4" fill="#121212" opacity="0.2" />
  </svg>
);

const GradGreen: FC<AvatarSvgProps> = (props) => {
  const id = useId();
  const gradId = `ag-grad-green-${id}`;
  return (
    <svg viewBox="0 0 40 40" fill="none" {...props}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="14" fill={`url(#${gradId})`} />
      <path d="M15 20 L18 23 L25 16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const GradBlue: FC<AvatarSvgProps> = (props) => {
  const id = useId();
  const gradId = `ag-grad-blue-${id}`;
  return (
    <svg viewBox="0 0 40 40" fill="none" {...props}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="14" fill={`url(#${gradId})`} />
      <path d="M14 17 L20 14 L26 17 L26 23 L20 26 L14 23 Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" fill="none" />
    </svg>
  );
};

const GradPink: FC<AvatarSvgProps> = (props) => {
  const id = useId();
  const gradId = `ag-grad-pink-${id}`;
  return (
    <svg viewBox="0 0 40 40" fill="none" {...props}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="14" fill={`url(#${gradId})`} />
      <path d="M20 13 L22 18 L27 18 L23 21 L25 27 L20 23 L15 27 L17 21 L13 18 L18 18 Z" fill="#fff" />
    </svg>
  );
};

const GradPurple: FC<AvatarSvgProps> = (props) => {
  const id = useId();
  const gradId = `ag-grad-purple-${id}`;
  return (
    <svg viewBox="0 0 40 40" fill="none" {...props}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="14" fill={`url(#${gradId})`} />
      <path d="M16 16 L24 16 L24 24 L16 24 Z" stroke="#fff" strokeWidth="2" fill="none" />
      <path d="M18 18 L22 18 L22 22 L18 22 Z" fill="#fff" />
    </svg>
  );
};

export interface DefaultAvatar {
  id: string;
  label: string;
  component: FC<AvatarSvgProps>;
}

export const DEFAULT_AVATARS: DefaultAvatar[] = [
  { id: "robot-01", label: "Robot Green", component: Robot1 },
  { id: "robot-02", label: "Robot Blue", component: Robot2 },
  { id: "robot-03", label: "Robot Pink", component: Robot3 },
  { id: "robot-04", label: "Robot Gold", component: Robot4 },
  { id: "fox-01", label: "Fox", component: Fox },
  { id: "owl-01", label: "Owl", component: Owl },
  { id: "cat-01", label: "Cat", component: Cat },
  { id: "wolf-01", label: "Wolf", component: Wolf },
  { id: "geo-hex", label: "Hexagon", component: GeoHex },
  { id: "geo-diamond", label: "Diamond", component: GeoDiamond },
  { id: "geo-triangle", label: "Triangle", component: GeoTriangle },
  { id: "geo-star", label: "Star", component: GeoStar },
  { id: "grad-green", label: "Gradient Green", component: GradGreen },
  { id: "grad-blue", label: "Gradient Blue", component: GradBlue },
  { id: "grad-pink", label: "Gradient Pink", component: GradPink },
  { id: "grad-purple", label: "Gradient Purple", component: GradPurple },
];

export const DEFAULT_AVATAR_PREFIX = "default:";

export function isDefaultAvatar(avatarUrl: string | null | undefined): boolean {
  return !!avatarUrl?.startsWith(DEFAULT_AVATAR_PREFIX);
}

export function getDefaultAvatarId(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl?.startsWith(DEFAULT_AVATAR_PREFIX)) return null;
  return avatarUrl.slice(DEFAULT_AVATAR_PREFIX.length);
}

export function pickDefaultAvatar(name: string): DefaultAvatar {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % DEFAULT_AVATARS.length;
  return DEFAULT_AVATARS[index];
}

export function getAvatarComponent(avatarUrl: string | null | undefined, name: string): FC<AvatarSvgProps> {
  const id = getDefaultAvatarId(avatarUrl);
  if (id) {
    const found = DEFAULT_AVATARS.find((a) => a.id === id);
    if (found) return found.component;
  }
  return pickDefaultAvatar(name).component;
}

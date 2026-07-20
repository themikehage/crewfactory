interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = "", size = 26 }: LogoProps) {
  return (
    <img
      src="/favicon.png"
      alt="CrewFactory"
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
}

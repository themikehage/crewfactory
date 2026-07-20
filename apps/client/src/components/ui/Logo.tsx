interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = "", size = 26 }: LogoProps) {
  return (
    <img
      src="/favicon.svg"
      alt="CrewFactory"
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
}

import { Link } from "react-router-dom";

export function NotFoundRoute() {
  return <div className="h-full flex flex-col items-center justify-center gap-4 bg-background text-foreground"><p className="text-2xl font-semibold">404</p><Link to="/" className="text-primary hover:underline">Volver al inicio</Link></div>;
}

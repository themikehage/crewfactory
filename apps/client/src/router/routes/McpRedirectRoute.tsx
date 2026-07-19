import { useEffect } from "react";
import { Navigate } from "react-router-dom";

export function McpRedirectRoute() {
  useEffect(() => {
    localStorage.setItem("settings-active-tab", "mcp");
  }, []);
  return <Navigate to="/settings" replace />;
}

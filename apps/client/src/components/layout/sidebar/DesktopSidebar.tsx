import type { ReactNode } from "react";

interface DesktopSidebarProps {
  sidebarOpen: boolean;
  children: ReactNode;
}

export function DesktopSidebar({ sidebarOpen, children }: DesktopSidebarProps) {
  return (
    <aside
      className={`${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      } fixed sm:relative sm:translate-x-0 z-50 sm:z-auto w-64 sm:w-64 flex-shrink-0 h-full border-r border-border bg-background transition-transform duration-200`}
    >
      {children}
    </aside>
  );
}

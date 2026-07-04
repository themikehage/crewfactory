interface Props {
  isMobile: boolean;
}

export function OrgChartEmpty({ isMobile }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-card border border-input flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-muted-foreground/30">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198.058-.02zM10.5 18a3 3 0 00-3-3h-3a3 3 0 00-3 3M10.5 18v-3a3 3 0 00-3-3h-3a3 3 0 00-3 3M19.5 9h-3M16.5 6a3 3 0 100 6 3 3 0 000-6zM9 6a3 3 0 100 6 3 3 0 000-6z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-foreground">
        No agents in this {isMobile ? "team" : "channel"}
      </p>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
        {isMobile
          ? "Add agents to build your team hierarchy. Leads, seniors, and members will appear here."
          : "Add agents to see the organizational chart with leads, seniors, members, and observers."}
      </p>
    </div>
  );
}

import { CustomUiRenderer } from "./CustomUiRenderer";

interface CustomToolBodyProps {
  ui: any;
  presentation?: { defaultExpanded?: boolean; accordionDefaultOpen?: boolean };
  sessionId?: string | null;
}

export function CustomToolBody({ ui, presentation, sessionId = null }: CustomToolBodyProps) {
  return <CustomUiRenderer ui={ui} presentation={presentation} sessionId={sessionId} />;
}

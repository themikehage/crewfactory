import type { ReactNode } from "react";
import { BadgeComponent } from "./BadgeComponent";
import { CardComponent } from "./CardComponent";
import { CardListComponent } from "./CardListComponent";
import { TableComponent } from "./TableComponent";
import { MetricComponent } from "./MetricComponent";
import { CodeComponent } from "./CodeComponent";
import { SectionComponent } from "./SectionComponent";
import { CustomHtmlComponent } from "./CustomHtmlComponent";
import { VideoComponent } from "./VideoComponent";
import { AudioComponent } from "./AudioComponent";
import { PdfComponent } from "./PdfComponent";
import { TabsComponent } from "./TabsComponent";
import { MarkdownComponent } from "./MarkdownComponent";
import { ProgressComponent } from "./ProgressComponent";
import { AccordionComponent } from "./AccordionComponent";
import { DiffComponent } from "./DiffComponent";
import { StepsComponent } from "./StepsComponent";
import { StatsComponent } from "./StatsComponent";
import { TimelineComponent } from "./TimelineComponent";
import { CUSTOM_TOOL_THEME_CSS } from "./design-tokens";

interface CustomUiRendererProps {
  ui: any | any[];
  presentation?: { defaultExpanded?: boolean; accordionDefaultOpen?: boolean };
  sessionId?: string | null;
}

export function CustomUiRenderer({ ui, presentation, sessionId = null }: CustomUiRendererProps) {
  if (!ui) return null;
  const components = Array.isArray(ui) ? ui : [ui];
  const accordionGlobalDefault = presentation?.accordionDefaultOpen ?? true;

  // Helper to render recursively inside Section, Tabs, Accordion, etc.
  const renderChild = (comp: any, key: number): ReactNode => {
    if (!comp || typeof comp !== "object") return null;

    switch (comp.type) {
      // Tier 1 — Base
      case "badge":
        return <BadgeComponent key={key} {...comp} />;
      case "card":
        return <CardComponent key={key} {...comp} />;
      case "card-list":
        return <CardListComponent key={key} {...comp} />;
      case "table":
        return <TableComponent key={key} {...comp} />;
      case "metric":
        return <MetricComponent key={key} {...comp} />;
      case "code":
        return <CodeComponent key={key} {...comp} />;
      case "section":
        return (
          <SectionComponent
            key={key}
            {...comp}
            renderChild={(child, idx) => renderChild(child, idx)}
          />
        );
      case "html":
        return <CustomHtmlComponent key={key} {...comp} tokens={CUSTOM_TOOL_THEME_CSS} />;

      // Tier 2 — Media
      case "video":
        return <VideoComponent key={key} {...comp} sessionId={sessionId} />;
      case "audio":
        return <AudioComponent key={key} {...comp} sessionId={sessionId} />;
      case "pdf":
        return <PdfComponent key={key} {...comp} sessionId={sessionId} />;

      // Tier 3 — High-demand
      case "tabs":
        return (
          <TabsComponent
            key={key}
            {...comp}
            renderChild={(child, idx) => renderChild(child, idx)}
          />
        );
      case "markdown":
        return <MarkdownComponent key={key} {...comp} />;
      case "progress":
        return <ProgressComponent key={key} {...comp} />;
      case "accordion":
        return (
          <AccordionComponent
            key={key}
            {...comp}
            defaultOpen={comp.defaultOpen ?? accordionGlobalDefault}
            renderChild={(child, idx) => renderChild(child, idx)}
          />
        );
      case "diff":
        return <DiffComponent key={key} {...comp} />;
      case "steps":
        return <StepsComponent key={key} {...comp} />;
      case "stats":
        return <StatsComponent key={key} {...comp} />;
      case "timeline":
        return <TimelineComponent key={key} {...comp} />;

      default:
        return (
          <div key={key} className="text-xs text-muted-foreground bg-muted p-2 rounded border border-border">
            Unknown component type: {comp.type}
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col gap-4 py-2 w-full">
      {components.map((comp, i) => renderChild(comp, i))}
    </div>
  );
}
export default CustomUiRenderer;

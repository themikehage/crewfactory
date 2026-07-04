import { motion } from "framer-motion";
import type { ChannelMember, ChannelRole } from "shared";

interface LevelGroup {
  role: string;
  list: ChannelMember[];
}

interface Props {
  levels: LevelGroup[];
  nodeHeight: number;
  levelHeight: number;
  totalWidth: number;
  totalHeight: number;
}

const OBSERVER_DASH = "3 3";

export function OrgChartLines({ levels, nodeHeight, levelHeight, totalWidth, totalHeight }: Props) {
  if (levels.length <= 1) return null;

  return (
    <svg
      width={totalWidth}
      height={totalHeight}
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      className="absolute inset-0 z-0 pointer-events-none"
    >
      {levels.map((lvl, i) => {
        if (i === levels.length - 1) return null;
        const nextLvl = levels[i + 1];

        const parentYBottom = 40 + i * levelHeight + nodeHeight;
        const childYTop = 40 + (i + 1) * levelHeight;
        const midY = parentYBottom + (childYTop - parentYBottom) / 2;

        const parentCount = lvl.list.length;
        const childCount = nextLvl.list.length;

        const elements: { d: string; isObserver: boolean }[] = [];

        for (let pIdx = 0; pIdx < parentCount; pIdx++) {
          const xCenter = (pIdx + 0.5) * (totalWidth / parentCount);
          const isObserver = (lvl.list[pIdx].role as ChannelRole) === "observer";
          elements.push({ d: `M ${xCenter} ${parentYBottom} L ${xCenter} ${midY}`, isObserver });
        }

        if (childCount > 1) {
          const minChildX = 0.5 * (totalWidth / childCount);
          const maxChildX = (childCount - 0.5) * (totalWidth / childCount);
          elements.push({ d: `M ${minChildX} ${midY} L ${maxChildX} ${midY}`, isObserver: false });
        }

        for (let cIdx = 0; cIdx < childCount; cIdx++) {
          const xCenter = (cIdx + 0.5) * (totalWidth / childCount);
          const isObserver = (nextLvl.list[cIdx].role as ChannelRole) === "observer";
          elements.push({ d: `M ${xCenter} ${midY} L ${xCenter} ${childYTop}`, isObserver });
        }

        return elements.map((el, idx) => (
          <motion.path
            key={`${i}-${idx}`}
            d={el.d}
            className={el.isObserver ? "stroke-muted-foreground/30" : "stroke-border"}
            strokeWidth={el.isObserver ? 1 : 1.5}
            strokeDasharray={el.isObserver ? OBSERVER_DASH : undefined}
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeInOut" }}
          />
        ));
      })}
    </svg>
  );
}

import { useState } from "react";
import { VariantLiveColumn } from "@/components/laboratory/VariantLiveColumn";
import type { Experiment } from "@/types/laboratory";

interface Props {
  activeExp: Experiment;
}

export function ExperimentLiveView({ activeExp }: Props) {
  const [activeVariantTab, setActiveVariantTab] = useState<"single" | "multiNoLeader" | "multiWithLeader">("single");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 bg-surface border border-surface-hover rounded-lg p-0.5 w-max">
        <button
          onClick={() => setActiveVariantTab("single")}
          className={`px-3 py-1.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeVariantTab === "single"
              ? "bg-bg text-accent border border-surface-hover"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Single (Baseline)
        </button>
        <button
          onClick={() => setActiveVariantTab("multiNoLeader")}
          className={`px-3 py-1.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeVariantTab === "multiNoLeader"
              ? "bg-bg text-accent border border-surface-hover"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Multi (Horizontal)
        </button>
        <button
          onClick={() => setActiveVariantTab("multiWithLeader")}
          className={`px-3 py-1.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeVariantTab === "multiWithLeader"
              ? "bg-bg text-accent border border-surface-hover"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Multi + Lider
        </button>
      </div>

      <div className="hidden xl:grid xl:grid-cols-3 gap-4">
        <VariantLiveColumn
          channelId={`lab_${activeExp.id}_single`}
          title="Single Agent (Baseline)"
          activeModel="Claude 3.5 Sonnet"
          result={activeExp.variants.single.result}
          expStatus={activeExp.status}
        />
        <VariantLiveColumn
          channelId={`lab_${activeExp.id}_multiNoLeader`}
          title="Multi-Agent (Horizontal)"
          activeModel="Modelos Mixtos / Debate"
          result={activeExp.variants.multiNoLeader.result}
          expStatus={activeExp.status}
        />
        <VariantLiveColumn
          channelId={`lab_${activeExp.id}_multiWithLeader`}
          title="Multi-Agent (Con Lider)"
          activeModel="Modelos Mixtos / Negociacion"
          result={activeExp.variants.multiWithLeader.result}
          expStatus={activeExp.status}
        />
      </div>

      <div className="xl:hidden">
        {activeVariantTab === "single" && (
          <VariantLiveColumn
            channelId={`lab_${activeExp.id}_single`}
            title="Single Agent (Baseline)"
            activeModel="Claude 3.5 Sonnet"
            result={activeExp.variants.single.result}
            expStatus={activeExp.status}
          />
        )}
        {activeVariantTab === "multiNoLeader" && (
          <VariantLiveColumn
            channelId={`lab_${activeExp.id}_multiNoLeader`}
            title="Multi-Agent (Horizontal)"
            activeModel="Modelos Mixtos / Debate"
            result={activeExp.variants.multiNoLeader.result}
            expStatus={activeExp.status}
          />
        )}
        {activeVariantTab === "multiWithLeader" && (
          <VariantLiveColumn
            channelId={`lab_${activeExp.id}_multiWithLeader`}
            title="Multi-Agent (Con Lider)"
            activeModel="Modelos Mixtos / Negociacion"
            result={activeExp.variants.multiWithLeader.result}
            expStatus={activeExp.status}
          />
        )}
      </div>
    </div>
  );
}

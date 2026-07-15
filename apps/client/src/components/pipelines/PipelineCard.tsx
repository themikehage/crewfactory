import type { PipelineDefinition } from "shared";
import { Play, ArrowRight, Layers, FileText } from "lucide-react";
import { useLiterals } from "@/lib";
import { literals as u } from "../../pages/PipelinesPage.literals";

interface PipelineCardProps {
  pipeline: PipelineDefinition;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
  onNavigate: (path: string) => void;
  runningId?: string | null;
}

export function PipelineCard({ pipeline, onDelete, onRun, onNavigate, runningId }: PipelineCardProps) {
  const l = useLiterals(u);
  const isRunning = runningId === pipeline.id;

  return (
    <div className="bg-surface border border-border rounded-xl p-6 hover:border-accent/40 hover:bg-surface-hover/20 transition-all group flex flex-col justify-between h-full relative overflow-hidden">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-bold text-text-primary group-hover:text-accent transition-colors">
              {pipeline.name}
            </h3>
          </div>
          <span className="text-xs px-2.5 py-1 bg-bg text-text-secondary border border-border rounded-full flex items-center gap-1 font-mono">
            <FileText className="w-3 h-3" />
            {pipeline.stages.length} {l.stagesCount}
          </span>
        </div>

        <p className="text-text-secondary text-sm line-clamp-3 mb-6">
          {pipeline.description || "—"}
        </p>

        {/* Stages steps preview */}
        <div className="flex items-center gap-1.5 flex-wrap mb-6">
          {pipeline.stages.map((stage, idx) => (
            <div key={stage.id} className="flex items-center gap-1.5">
              <span className="text-xs px-2 py-0.5 bg-bg text-text-primary rounded border border-border font-mono">
                {stage.name}
              </span>
              {idx < pipeline.stages.length - 1 && (
                <ArrowRight className="w-3.5 h-3.5 text-text-secondary" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border/60 pt-4 mt-auto">
        <button
          onClick={() => onRun(pipeline.id)}
          disabled={isRunning}
          className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2 px-4 rounded-lg transition-all cursor-pointer ${
            isRunning
              ? "bg-surface text-text-secondary border border-border cursor-not-allowed"
              : "bg-accent/10 text-accent border border-accent/20 hover:bg-accent hover:text-bg hover:border-accent"
          }`}
        >
          <Play className="w-4 h-4 fill-current" />
          {isRunning ? l.running : l.runPipeline}
        </button>

        <button
          onClick={() => onNavigate(`/pipelines/${pipeline.id}`)}
          className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold bg-surface border border-border hover:border-accent/40 text-text-primary py-2 px-4 rounded-lg transition-all cursor-pointer"
        >
          {l.viewDetails}
        </button>

        <button
          onClick={() => onDelete(pipeline.id)}
          className="text-xs text-error/80 hover:text-error hover:bg-error/5 p-2 rounded-lg transition-colors border border-transparent hover:border-error/20 cursor-pointer"
        >
          {l.delete}
        </button>
      </div>
    </div>
  );
}


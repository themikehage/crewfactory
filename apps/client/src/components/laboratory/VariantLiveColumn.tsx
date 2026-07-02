import { useChannel } from "@/hooks/useChannel";
import { ChannelMessageList } from "@/components/channels/ChannelMessageList";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface VariantRunResult {
  status: "pending" | "running" | "completed" | "failed";
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  negotiationRounds?: number;
  escalationsToLeader?: number;
  agreementReached?: boolean;
  finalOutput: string;
  scores?: {
    taskQuality: number;
    efficiencyScore: number;
    negotiationScore?: number;
    globalScore: number;
  };
}

interface Props {
  channelId: string;
  title: string;
  activeModel: string;
  result?: VariantRunResult;
  expStatus: string;
}

export function VariantLiveColumn({ channelId, title, activeModel, result, expStatus }: Props) {
  const { messages, streamingAgents, loading } = useChannel(channelId);

  const isRunning = expStatus === "running";
  const hasResult = result && result.finalOutput;
  const isStreaming = Object.keys(streamingAgents).length > 0;

  return (
    <div className="flex flex-col bg-surface border border-surface-hover rounded-xl overflow-hidden h-[450px]">
      <div className="p-3 bg-surface border-b border-surface-hover flex justify-between items-center flex-shrink-0">
        <div>
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">{title}</h4>
          <p className="text-[10px] text-text-secondary">{activeModel}</p>
        </div>
        {(isRunning || isStreaming) && (
          <div className="flex items-center gap-1.5 bg-accent/10 px-2 py-0.5 rounded-full text-[9px] text-accent border border-accent/20 animate-pulse">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-ping" />
            <span>Transmitiendo</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-text-secondary/40 text-xs animate-pulse">
          Cargando...
        </div>
      ) : isRunning || messages.length > 0 ? (
        <ChannelMessageList
          messages={messages}
          streamingAgents={streamingAgents}
        />
      ) : hasResult ? (
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="prose prose-invert max-w-none text-text-secondary text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result.finalOutput}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-secondary/30 text-xs">
          Sin ejecucion cargada
        </div>
      )}
    </div>
  );
}

import { useChannel } from "@/hooks/useChannel";
import { useAgents } from "@/hooks/useAgents";
import { ChannelBenchmarkTab } from "@/components/channels/benchmarks/ChannelBenchmarkTab";

interface Props {
  channelId: string;
  onNavigate: (path: string) => void;
}

export function ChannelBenchmarkPage({ channelId, onNavigate }: Props) {
  const { channel, loading, error } = useChannel(channelId);
  const { agents: registeredAgents } = useAgents();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-destructive gap-3 select-none">
        <p className="text-sm font-medium">{error || "Channel not found"}</p>
        <button
          onClick={() => onNavigate("/channels")}
          className="px-4 py-2 text-xs bg-card border border-input text-foreground rounded-lg hover:bg-card-hover transition-colors cursor-pointer"
        >
          Back to Channels
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden relative">
      {/* Top Header */}
      <div className="h-12 px-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-card/50 backdrop-blur-sm z-10 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onNavigate(`/channel/${channelId}`)}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
            title="Back to Channel Chat"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-primary font-bold text-base">#</span>
            <h2 className="text-sm font-semibold text-foreground truncate">{channel.name}</h2>
          </div>
          <span className="text-muted-foreground select-none">|</span>
          <span className="text-xs text-muted-foreground truncate">Benchmark Dashboard</span>
        </div>
      </div>

      {/* Benchmark Tab content */}
      <div className="flex-1 overflow-hidden min-h-0">
        <ChannelBenchmarkTab
          channelId={channelId}
          members={channel.members}
          registeredAgents={registeredAgents}
        />
      </div>
    </div>
  );
}
export default ChannelBenchmarkPage;

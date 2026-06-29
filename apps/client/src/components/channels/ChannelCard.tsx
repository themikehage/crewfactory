import { motion } from "framer-motion";
import type { Channel } from "shared";

interface Props {
  channel: Channel;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onManageMembers?: (channel: Channel) => void;
  onManageContext?: (channel: Channel) => void;
}

export function ChannelCard({ channel, onOpen, onDelete, onManageMembers, onManageContext }: Props) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="bg-surface border border-surface-hover rounded-xl p-4 flex flex-col gap-3 hover:border-accent/20 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 text-accent font-bold text-sm">
            #
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-text-primary text-sm truncate">{channel.name}</h3>
            {channel.description && (
              <p className="text-text-secondary text-xs truncate mt-0.5">{channel.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(channel.id);
          }}
          className="p-1.5 rounded-lg text-text-secondary hover:text-error hover:bg-error/10 transition-colors flex-shrink-0"
          title="Delete Channel"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between pt-1 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="opacity-70">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
          </svg>
          {channel.members.length} {channel.members.length === 1 ? "agente" : "agentes"}
        </span>
        <span>{new Date(channel.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface-hover/50">
        <button
          onClick={() => onOpen(channel.id)}
          className="flex-1 min-w-[80px] py-1.5 px-3 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded-lg hover:bg-accent/20 transition-colors"
        >
          Abrir Chat
        </button>
        {onManageContext && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onManageContext(channel);
            }}
            className="py-1.5 px-2.5 text-xs font-medium bg-blue-400/10 text-blue-400 border border-blue-400/20 rounded-lg hover:bg-blue-400/20 transition-colors flex items-center gap-1"
            title="Gestionar variables de contexto"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            Contexto ({channel.context?.length ?? 0})
          </button>
        )}
        {onManageMembers && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onManageMembers(channel);
            }}
            className="py-1.5 px-2.5 text-xs font-medium bg-purple-400/10 text-purple-400 border border-purple-400/20 rounded-lg hover:bg-purple-400/20 transition-colors flex items-center gap-1"
            title="Gestionar miembros del canal"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            Miembros ({channel.members.length})
          </button>
        )}
      </div>
    </motion.div>
  );
}

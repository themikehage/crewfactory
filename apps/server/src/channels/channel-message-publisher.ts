import { channelStore } from "./channel-store";
import { eventBroker } from "../lib/event-broker";
import type { ChannelMessage } from "shared";

type BroadcastFn = (channelId: string, data: any) => void;

export function createMessagePublisher(broadcastFn: BroadcastFn) {
  return function publishChannelMessage(
    username: string,
    channelId: string,
    channelName: string,
    message: ChannelMessage,
    eventType: "user_message" | "agent_message" = "agent_message"
  ): void {
    channelStore.appendMessage(username, channelId, message);
    broadcastFn(channelId, { type: "channel_message", channelId, message });
    eventBroker.publishEvent(username, {
      sourceType: "channel",
      sourceId: channelId,
      sourceName: channelName,
      eventType,
      agentName: message.agentName,
      detail: message.content,
    });
  };
}

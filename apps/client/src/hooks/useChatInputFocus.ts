import { useEffect, useRef } from "react";

interface UseChatInputFocusOptions {
  sessionId: string | null;
  loadingMessages: boolean;
  streaming: boolean;
}

export function useChatInputFocus({
  sessionId,
  loadingMessages,
  streaming,
}: UseChatInputFocusOptions) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const focusInput = () => {
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const length = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    });
  };

  // Focus when entering a session (after loading messages completes) or on initial page load if no session
  useEffect(() => {
    if (!loadingMessages && !streaming) {
      focusInput();
    }
  }, [sessionId, loadingMessages]);

  // Focus when the agent finishes streaming
  useEffect(() => {
    if (!streaming && !loadingMessages) {
      focusInput();
    }
  }, [streaming]);

  return textareaRef;
}

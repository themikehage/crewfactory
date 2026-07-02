import { useState, useCallback, useRef, useEffect } from "react";
import { useWebSocket } from "./useWebSocket";

interface LLMRequestOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
}

interface UseLLMChannelReturn {
  loading: boolean;
  text: string;
  result: string | null;
  error: string | null;
  sendRequest: (options: LLMRequestOptions) => Promise<string>;
  reset: () => void;
}

export function useLLMChannel(sessionId: string | null = "llm_channel"): UseLLMChannelReturn {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { connected, send, subscribe } = useWebSocket(sessionId);
  const pendingRequests = useRef<Map<string, {
    resolve: (result: string) => void;
    reject: (error: string) => void;
  }>>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      pendingRequests.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!connected && loading) {
      setLoading(false);
      setError("Conexión con el servidor perdida.");
      pendingRequests.current.forEach((pending) => {
        pending.reject("WebSocket disconnected");
      });
      pendingRequests.current.clear();
    }
  }, [connected, loading]);

  useEffect(() => {
    const unsubDelta = subscribe("llm_delta", (data: unknown) => {
      const evt = data as { requestId: string; text: string };
      console.log("[LLMChannel] Received delta chunk for", evt.requestId, "text length:", evt.text?.length);
      const pending = pendingRequests.current.get(evt.requestId);
      if (pending && mountedRef.current) {
        setText((prev) => prev + evt.text);
      }
    });

    const unsubComplete = subscribe("llm_complete", (data: unknown) => {
      const evt = data as { requestId: string; result: string };
      console.log("[LLMChannel] Received complete response for", evt.requestId, "result length:", evt.result?.length);
      const pending = pendingRequests.current.get(evt.requestId);
      if (pending) {
        pendingRequests.current.delete(evt.requestId);
        if (mountedRef.current) {
          setResult(evt.result);
          setLoading(false);
        }
        pending.resolve(evt.result);
      }
    });

    const unsubError = subscribe("llm_error", (data: unknown) => {
      const evt = data as { requestId: string; error: string };
      console.log("[LLMChannel] Received error response for", evt.requestId, "error:", evt.error);
      const pending = pendingRequests.current.get(evt.requestId);
      if (pending) {
        pendingRequests.current.delete(evt.requestId);
        if (mountedRef.current) {
          setError(evt.error);
          setLoading(false);
        }
        pending.reject(evt.error);
      }
    });

    return () => {
      unsubDelta();
      unsubComplete();
      unsubError();
    };
  }, [subscribe]);

  const sendRequest = useCallback(async (options: LLMRequestOptions): Promise<string> => {
    if (!connected) {
      console.log("[LLMChannel] Cannot sendRequest because connected is false");
      throw new Error("WebSocket not connected");
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    console.log("[LLMChannel] sendRequest starting. requestId:", requestId, "model:", options.model);

    setLoading(true);
    setText("");
    setResult(null);
    setError(null);

    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve, reject });

      send({
        type: "llm_request",
        requestId,
        prompt: options.prompt,
        systemPrompt: options.systemPrompt,
        model: options.model,
      });
    });
  }, [connected, send]);

  const reset = useCallback(() => {
    setLoading(false);
    setText("");
    setResult(null);
    setError(null);
  }, []);

  return { loading, text, result, error, sendRequest, reset };
}

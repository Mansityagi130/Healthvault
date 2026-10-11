"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_URL, getAccessToken } from "@/lib/api-client";

export interface NotificationEventPayload {
  id: string;
  type: string;
  timestamp: string;
}

export interface UseNotificationStreamOptions {
  onNotification?: (event: NotificationEventPayload) => void;
  enabled?: boolean;
}

export function useNotificationStream({ onNotification, enabled = true }: UseNotificationStreamOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  const handleNotification = useCallback((event: NotificationEventPayload) => {
    onNotificationRef.current?.(event);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let isAborted = false;
    let abortController: AbortController | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let attempts = 0;

    async function connectStream() {
      const token = getAccessToken();
      if (!token) {
        setIsConnected(false);
        return;
      }

      abortController = new AbortController();

      try {
        const response = await fetch(`${API_URL}/notifications/stream`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: abortController.signal,
          credentials: "include",
        });

        if (!response.ok) {
          setIsConnected(false);
          // 401/403: unauthenticated or forbidden - do not retry in an infinite loop
          if (response.status === 401 || response.status === 403) {
            return;
          }
          scheduleReconnect();
          return;
        }

        if (!response.body) {
          scheduleReconnect();
          return;
        }

        setIsConnected(true);
        attempts = 0; // Reset backoff counter on successful stream connect

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!isAborted) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Retain trailing un-delimited data chunk in buffer
          buffer = lines.pop() || "";

          let currentEvent = "";
          let currentData = "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              // Empty line signals completion of an SSE message block
              if (currentEvent === "notification" && currentData) {
                try {
                  const parsed: NotificationEventPayload = JSON.parse(currentData);
                  if (parsed && parsed.id && parsed.type) {
                    handleNotification(parsed);
                  }
                } catch {
                  // Safely ignore malformed data
                }
              }
              currentEvent = "";
              currentData = "";
            } else if (trimmed.startsWith("event:")) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith("data:")) {
              currentData = trimmed.slice(5).trim();
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError" || isAborted) {
          return;
        }
        setIsConnected(false);
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (isAborted) return;
      attempts++;
      // Bounded exponential backoff: 2s, 4s, 8s up to 30s max delay
      const delay = Math.min(30000, Math.pow(2, attempts) * 1000);
      reconnectTimeout = setTimeout(() => {
        if (!isAborted) {
          connectStream();
        }
      }, delay);
    }

    connectStream();

    return () => {
      isAborted = true;
      setIsConnected(false);
      if (abortController) {
        abortController.abort();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [enabled, handleNotification]);

  return { isConnected };
}

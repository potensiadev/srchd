"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseCandidatesRealtimeOptions {
  userId: string | null;
  onUpdate: () => void;
  enabled?: boolean;
}

export function useCandidatesRealtime({
  userId,
  onUpdate,
  enabled = true,
}: UseCandidatesRealtimeOptions): void {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!userId || !enabled) return;

    console.log("[Realtime] Subscribing to candidates changes for user:", userId);

    // 기존 채널 정리
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`candidates-page-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidates",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("[Realtime] Candidate change:", payload.eventType);
          onUpdate();
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] Subscription status:", status);
      });

    channelRef.current = channel;

    return () => {
      console.log("[Realtime] Unsubscribing");
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, enabled, onUpdate, supabase]);
}

"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * 클라이언트/서버 세션을 모두 정리해 인증 상태 불일치를 방지한다.
 */
export async function logoutAndClearSession() {
  const supabase = createClient();

  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.warn("[Logout] Client signOut failed:", error);
  }

  if (typeof window !== "undefined") {
    const keysToRemove: string[] = [];

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("sb-") && key.includes("auth-token")) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));

    window.location.href = "/api/auth/signout";
  }
}

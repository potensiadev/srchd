/**
 * Supabase Browser Client
 * 클라이언트 컴포넌트에서 사용
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 빌드 시 환경변수가 없을 수 있음 - 더미 값 사용
  if (!supabaseUrl || !supabaseAnonKey) {
    // 빌드 타임에는 더미 클라이언트 반환 (실제 사용되지 않음)
    return createBrowserClient<Database>(
      "https://placeholder.supabase.co",
      "placeholder-key"
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

// 싱글톤 인스턴스 (옵션)
let browserClient: ReturnType<typeof createClient> | null = null;

export function getClient() {
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}

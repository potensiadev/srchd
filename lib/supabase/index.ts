/**
 * Supabase Client Exports
 */

// Browser client (클라이언트 컴포넌트용)
export { createClient as createBrowserClient, getClient } from "./client";

// Server client (서버 컴포넌트, API 라우트용)
export {
  createClient as createServerClient,
  getUser,
  getUserProfile,
  checkConsentsCompleted,
} from "./server";

// Middleware client
export { updateSession } from "./middleware";

import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Next.js modules
vi.mock("next/server", () => ({
  NextRequest: vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    return {
      url,
      method: init?.method || "GET",
      headers: new Headers(init?.headers),
      json: vi.fn().mockResolvedValue({}),
      formData: vi.fn().mockResolvedValue(new FormData()),
    };
  }),
  NextResponse: {
    json: vi.fn().mockImplementation((data: unknown, init?: ResponseInit) => ({
      status: init?.status || 200,
      headers: new Headers(init?.headers),
      json: () => Promise.resolve(data),
    })),
  },
}));

// Mock Supabase client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        download: vi.fn().mockResolvedValue({ data: null, error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}));

// Mock environment variables
process.env.WORKER_URL = "http://localhost:8000";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

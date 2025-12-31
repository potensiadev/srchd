import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HR Screener - Login",
  description: "AI-powered recruitment asset intelligence",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-deep-space">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-ai/5" />
      <div className="relative z-10 w-full max-w-md px-4">
        {children}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Sidebar from "@/components/layout/Sidebar";
import AdaptiveBackground from "@/components/layout/AdaptiveBackground";

export const metadata: Metadata = {
  title: "HR Screener - Dashboard",
  description: "AI-powered recruitment asset intelligence",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen">
      {/* Animated Background - 성능에 따라 3D 또는 CSS 배경 자동 선택 */}
      <AdaptiveBackground mode="auto" />

      {/* Content Layer */}
      <div className="relative z-10 flex w-full">
        <Sidebar />
        <main className="flex-1 ml-64 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

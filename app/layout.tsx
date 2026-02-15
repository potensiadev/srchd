import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { QueryProvider } from "@/providers/QueryProvider";
import { ToastProviderWrapper } from "@/providers/ToastProviderWrapper";
import { DisableLegacyOfflineNotice } from "@/components/system/DisableLegacyOfflineNotice";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "서치드 - AI 이력서 분석 플랫폼",
  description: "서치드 - 헤드헌터를 위한 AI 기반 이력서 분석 및 후보자 검색 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={cn(
          inter.variable,
          jetbrainsMono.variable,
          "antialiased bg-background text-foreground min-h-screen font-sans"
        )}
      >
        <QueryProvider>
          <ToastProviderWrapper>
            <DisableLegacyOfflineNotice />
            {children}
          </ToastProviderWrapper>
        </QueryProvider>
      </body>
    </html>
  );
}

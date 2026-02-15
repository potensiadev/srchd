"use client";

import { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

export function ToastProviderWrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

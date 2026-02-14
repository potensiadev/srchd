"use client";

import { motion } from "framer-motion";
import { Users, BarChart3, Settings, Briefcase, LogOut, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";
import CreditCounter from "./CreditCounter";
import { useCredits } from "@/hooks";
import { PLAN_CONFIG, type PlanId } from "@/lib/paddle/config";
import { logoutAndClearSession } from "@/lib/auth/logout";

const NAV_ITEMS = [
    { icon: Users, label: "Candidates", href: "/candidates" },
    { icon: ShieldAlert, label: "Review Queue", href: "/review" },
    { icon: Briefcase, label: "Positions", href: "/positions" },
    { icon: BarChart3, label: "Analytics", href: "/analytics" },
    { icon: Settings, label: "Settings", href: "/settings" },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { data: creditsData, isLoading: isCreditsLoading, error: creditsError } = useCredits();

    // 이메일은 useCredits에서 가져옴 (서버 측 인증 기반)
    const userEmail = creditsData?.email || "";

    const handleLogout = async () => {
        await logoutAndClearSession();
    };

    const isActive = (href: string) => {
        return pathname.startsWith(href);
    };

    // Get plan display name
    const planId = (creditsData?.plan || "starter") as PlanId;
    const planName = PLAN_CONFIG[planId]?.name || "Starter";

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-white border-r border-gray-100 flex flex-col justify-between p-6">
            {/* Brand */}
            <Link href="/candidates" className="flex items-center mb-10">
                <h1 className="font-bold text-xl tracking-tight text-gray-900">서치드</h1>
            </Link>

            {/* Navigation */}
            <nav className="flex-1 space-y-1">
                {NAV_ITEMS.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group relative",
                                active
                                    ? "bg-gray-50 text-gray-900"
                                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50/50"
                            )}
                        >
                            <item.icon size={18} className={cn(
                                "transition-colors",
                                active ? "text-primary" : "text-gray-400 group-hover:text-gray-600"
                            )} />
                            {item.label}

                            {/* Active Indicator */}
                            {active && (
                                <motion.div
                                    layoutId="sidebar-active"
                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full"
                                />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="space-y-6">
                {/* Credit Counter */}
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <CreditCounter />
                </div>

                {/* User Profile / Logout */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                            <Users size={14} />
                        </div>
                        <div className="text-xs max-w-[140px]">
                            <p className="font-medium text-gray-900 truncate" title={userEmail}>
                                {userEmail || (creditsError ? "세션 만료" : isCreditsLoading ? "Loading..." : "-" )}
                            </p>
                            <p className="text-gray-400">{planName} Plan</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        title="로그아웃"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </aside>
    );
}

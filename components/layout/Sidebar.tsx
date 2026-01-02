"use client";

import { motion } from "framer-motion";
import { Upload, Users, BarChart3, ShieldAlert, Settings, Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";
import CreditCounter from "./CreditCounter";
import { FLOATING_PHYSICS } from "@/lib/physics";

const NAV_ITEMS = [
    { icon: Users, label: "Candidates", href: "/candidates" },
    { icon: Upload, label: "Upload", href: "/upload" },
    { icon: BarChart3, label: "Analytics", href: "/analytics" },
    { icon: ShieldAlert, label: "Risk Management", href: "/risk", alert: true },
    { icon: Settings, label: "Settings", href: "/settings" },
];

export default function Sidebar() {
    const pathname = usePathname();

    const isActive = (href: string) => {
        return pathname.startsWith(href);
    };

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-white/5 bg-white/[0.02] backdrop-blur-xl flex flex-col justify-between p-6">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-10">
                <motion.div
                    animate={FLOATING_PHYSICS.y}
                    className="p-2 bg-primary/20 rounded-lg border border-primary/50 text-primary box-shadow-glow"
                >
                    <Hexagon size={24} fill="currentColor" fillOpacity={0.2} />
                </motion.div>
                <div>
                    <h1 className="font-bold text-lg tracking-tight text-white">RAI</h1>
                    <p className="text-[10px] text-slate-400 tracking-widest uppercase">Recruitment AI</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1">
                {NAV_ITEMS.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors group relative",
                                active
                                    ? "bg-white/5 text-white font-medium"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <item.icon size={18} className={cn(
                                "transition-colors",
                                active ? "text-primary" : "text-slate-500 group-hover:text-white"
                            )} />
                            {item.label}

                            {/* Active Indicator */}
                            {active && (
                                <motion.div
                                    layoutId="sidebar-active"
                                    className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                                />
                            )}

                            {/* Risk Alert Badge */}
                            {item.alert && (
                                <span className="ml-auto w-2 h-2 rounded-full bg-risk animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer / Credits */}
            <div className="pt-6 border-t border-white/5">
                <CreditCounter />
            </div>
        </aside>
    );
}

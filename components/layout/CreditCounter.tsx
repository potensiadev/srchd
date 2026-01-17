"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useCredits } from "@/hooks";
import { AlertCircle, Loader2 } from "lucide-react";

// Animated rolling number
function SimpleRollingNumber({ value }: { value: number }) {
    const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });
    const display = useTransform(spring, (current) => Math.round(current));

    useEffect(() => {
        spring.set(value);
    }, [value, spring]);

    return <motion.span>{display}</motion.span>;
}

export default function CreditCounter({ className }: { className?: string }) {
    const { data, isLoading, error } = useCredits();

    // 로딩 상태
    if (isLoading) {
        return (
            <div className={cn("flex flex-col gap-1", className)}>
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                    Credits
                </span>
                <div className="flex items-center gap-2 font-mono text-xl text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                </div>
            </div>
        );
    }

    // 에러 상태
    if (error) {
        return (
            <div className={cn("flex flex-col gap-1", className)}>
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                    Credits
                </span>
                <div className="flex items-center gap-2 text-rose-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>Error</span>
                </div>
            </div>
        );
    }

    const remainingCredits = data?.remainingCredits ?? 0;
    const isLow = remainingCredits <= 10;
    const isEmpty = remainingCredits <= 0;

    return (
        <div className={cn("flex flex-col gap-1", className)}>
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                Credits
            </span>
            <div
                className={cn(
                    "flex items-center gap-2 font-mono text-xl font-bold transition-colors",
                    isEmpty
                        ? "text-rose-400"
                        : isLow
                          ? "text-yellow-400"
                          : "text-primary"
                )}
            >
                <SimpleRollingNumber value={remainingCredits} />
                <span className="text-xs text-gray-500 font-normal">AVAL</span>
            </div>

            {/* Low credit warning */}
            {isLow && !isEmpty && (
                <motion.span
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[10px] text-yellow-400"
                >
                    Low credits!
                </motion.span>
            )}

            {/* Empty credit warning */}
            {isEmpty && (
                <motion.span
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[10px] text-rose-400"
                >
                    No credits left
                </motion.span>
            )}
        </div>
    );
}

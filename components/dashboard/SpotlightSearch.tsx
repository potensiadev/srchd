"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Search, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MAGNETIC_SPRING } from "@/lib/physics";

interface SpotlightSearchProps {
    query: string;
    onQueryChange: (query: string) => void;
}

export default function SpotlightSearch({ query, onQueryChange }: SpotlightSearchProps) {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Semantic Mode trigger
    const isSemantic = query.length > 10;

    // Keyboard shortcut (/) to focus
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "/" && !isFocused) {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === "Escape") {
                inputRef.current?.blur();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFocused]);

    return (
        <div className="relative z-50 flex justify-center mb-12">
            {/* Dimmed Backdrop */}
            <AnimatePresence>
                {isFocused && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                        onClick={() => setIsFocused(false)}
                    />
                )}
            </AnimatePresence>

            {/* Search Bar */}
            <motion.div
                layout
                initial={{ width: 600 }}
                animate={{ width: isFocused ? 800 : 600 }}
                transition={MAGNETIC_SPRING}
                className={cn(
                    "relative z-50 h-16 rounded-2xl flex items-center px-6 gap-4 transition-colors",
                    isFocused
                        ? "bg-[#0A0A1B] border border-primary/50 shadow-[0_0_40px_rgba(139,92,246,0.15)]"
                        : "bg-white/5 border border-white/10 hover:border-white/20"
                )}
            >
                <motion.div
                    animate={{ scale: isSemantic ? 1.1 : 1, rotate: isSemantic ? 15 : 0 }}
                    className={cn("transition-colors", isSemantic ? "text-ai" : "text-slate-400")}
                >
                    {isSemantic ? <Sparkles size={24} /> : <Search size={24} />}
                </motion.div>

                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={isSemantic ? "Semantic Vector Search Active..." : "Search candidates by name, skills, or role..."}
                    className="flex-1 bg-transparent border-none outline-none text-lg text-white placeholder:text-slate-500 font-medium"
                />

                <div className="flex items-center gap-2">
                    {isFocused ? (
                        <span className="text-xs text-slate-500 bg-white/10 px-2 py-1 rounded">ESC</span>
                    ) : (
                        <span className="text-xs text-slate-500 bg-white/10 px-2 py-1 rounded">/</span>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

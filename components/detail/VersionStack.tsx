"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { History, ChevronDown, Calendar, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Version {
    id: string;
    version: number;
    createdAt: string;
    fileName?: string;
    changes?: string[];  // 변경된 필드들
}

interface VersionStackProps {
    versions: Version[];
    currentVersion: number;
    onVersionSelect: (id: string) => void;
}

export default function VersionStack({
    versions,
    currentVersion,
    onVersionSelect,
}: VersionStackProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (versions.length <= 1) return null;

    const pastVersions = versions.filter(v => v.version < currentVersion);
    const stackedVersions = pastVersions.slice(0, 3); // 최대 3개까지 스택 표시

    return (
        <div className="relative">
            {/* Stacked Cards Background (Preview) */}
            <AnimatePresence>
                {!isExpanded && stackedVersions.length > 0 && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-[95%]">
                        {stackedVersions.map((version, index) => (
                            <motion.div
                                key={version.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{
                                    opacity: 0.3 - index * 0.1,
                                    y: -(index + 1) * 4,
                                    rotate: -(index + 1) * 2,
                                    scale: 1 - (index + 1) * 0.02,
                                }}
                                exit={{ opacity: 0, y: 0 }}
                                className="absolute inset-x-0 h-12 rounded-xl bg-slate-700 border border-slate-600"
                                style={{ zIndex: -index - 1 }}
                            />
                        ))}
                    </div>
                )}
            </AnimatePresence>

            {/* Main Version Indicator */}
            <motion.button
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    "w-full p-4 rounded-xl border transition-all flex items-center justify-between",
                    isExpanded
                        ? "bg-primary/10 border-primary/30"
                        : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                )}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20 text-primary">
                        <History size={18} />
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-medium text-white">
                            버전 {currentVersion} (현재)
                        </p>
                        <p className="text-xs text-slate-400">
                            {pastVersions.length}개의 이전 버전 존재
                        </p>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDown size={18} className="text-slate-400" />
                </motion.div>
            </motion.button>

            {/* Expanded Version List */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-3 space-y-2">
                            {versions
                                .sort((a, b) => b.version - a.version)
                                .map((version, index) => {
                                    const isCurrent = version.version === currentVersion;

                                    return (
                                        <motion.button
                                            key={version.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            onClick={() => !isCurrent && onVersionSelect(version.id)}
                                            disabled={isCurrent}
                                            className={cn(
                                                "w-full p-3 rounded-lg border text-left transition-all flex items-center gap-3",
                                                isCurrent
                                                    ? "bg-primary/10 border-primary/30 cursor-default"
                                                    : "bg-slate-800/30 border-slate-700 hover:border-slate-500 hover:bg-slate-800/50"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-1.5 rounded-lg",
                                                isCurrent ? "bg-primary/20 text-primary" : "bg-slate-700 text-slate-400"
                                            )}>
                                                <FileText size={14} />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-sm font-medium",
                                                        isCurrent ? "text-primary" : "text-white"
                                                    )}>
                                                        버전 {version.version}
                                                    </span>
                                                    {isCurrent && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                                                            현재
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                                                    <Calendar size={10} />
                                                    <span>
                                                        {new Date(version.createdAt).toLocaleDateString("ko-KR")}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Changes Preview */}
                                            {version.changes && version.changes.length > 0 && (
                                                <div className="text-xs text-slate-500">
                                                    +{version.changes.length} 변경
                                                </div>
                                            )}
                                        </motion.button>
                                    );
                                })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

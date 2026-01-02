"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileText, Cpu, Sparkles, CheckCircle, Image, Database } from "lucide-react";
import { useState, useEffect } from "react";

export type ProcessingPhase =
    | "idle"
    | "uploading"
    | "routing"      // Phase 1: Router Agent
    | "analyzing"    // Phase 2: Cross-Check (GPT + Gemini)
    | "extracting"   // Phase 3: Visual/Privacy Agent
    | "embedding"    // Phase 4: Vector Embedding
    | "complete";

interface ProcessingVisualizationProps {
    phase: ProcessingPhase;
    fileName?: string;
    onComplete?: () => void;
}

const PHASES = [
    { id: "routing", label: "분류", description: "파일 형식 분석", icon: FileText },
    { id: "analyzing", label: "AI 분석", description: "Cross-Check", icon: Sparkles },
    { id: "extracting", label: "추출", description: "사진/개인정보", icon: Image },
    { id: "embedding", label: "임베딩", description: "벡터 생성", icon: Database },
    { id: "complete", label: "완료", description: "검색 가능", icon: CheckCircle },
];

export default function ProcessingVisualization({
    phase,
    fileName,
    onComplete,
}: ProcessingVisualizationProps) {
    const [beamActive, setBeamActive] = useState(false);

    // Cross-Check 빔 애니메이션
    useEffect(() => {
        if (phase === "analyzing") {
            setBeamActive(true);
        } else {
            setBeamActive(false);
        }
    }, [phase]);

    // 완료 콜백
    useEffect(() => {
        if (phase === "complete") {
            const timer = setTimeout(() => onComplete?.(), 1500);
            return () => clearTimeout(timer);
        }
    }, [phase, onComplete]);

    if (phase === "idle") return null;

    const currentPhaseIndex = PHASES.findIndex(p => p.id === phase);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <motion.div
                    animate={{ rotate: phase !== "complete" ? 360 : 0 }}
                    transition={{ duration: 2, repeat: phase !== "complete" ? Infinity : 0, ease: "linear" }}
                    className="p-2 rounded-lg bg-primary/20 text-primary"
                >
                    <Cpu size={20} />
                </motion.div>
                <div>
                    <h3 className="text-white font-semibold">AI 처리 중</h3>
                    {fileName && (
                        <p className="text-sm text-slate-400 truncate max-w-[200px]">{fileName}</p>
                    )}
                </div>
            </div>

            {/* Cross-Check Beam Animation (Phase 2) */}
            <AnimatePresence>
                {beamActive && (
                    <div className="relative h-16 mb-6 rounded-xl bg-slate-900/50 overflow-hidden">
                        {/* GPT-4o Beam (Blue) */}
                        <motion.div
                            initial={{ x: "-100%", opacity: 0 }}
                            animate={{ x: "100%", opacity: [0, 1, 1, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-blue-500/40 to-transparent"
                        />
                        {/* Gemini Beam (Orange) */}
                        <motion.div
                            initial={{ x: "200%", opacity: 0 }}
                            animate={{ x: "-100%", opacity: [0, 1, 1, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                            className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-r from-transparent via-orange-500/40 to-transparent"
                        />
                        {/* Center Merge Effect */}
                        <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1, repeat: Infinity }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-blue-400 font-mono">GPT-4o</span>
                                <motion.div
                                    animate={{ scale: [0.8, 1.2, 0.8] }}
                                    transition={{ duration: 0.5, repeat: Infinity }}
                                    className="w-2 h-2 rounded-full bg-emerald-400"
                                />
                                <span className="text-xs text-orange-400 font-mono">Gemini</span>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Phase Progress */}
            <div className="flex items-center justify-between">
                {PHASES.map((p, index) => {
                    const isComplete = index < currentPhaseIndex;
                    const isCurrent = p.id === phase;
                    const Icon = p.icon;

                    return (
                        <div key={p.id} className="flex flex-col items-center flex-1">
                            {/* Connection Line */}
                            {index > 0 && (
                                <div className="absolute h-0.5 w-full -translate-y-4">
                                    <motion.div
                                        initial={{ scaleX: 0 }}
                                        animate={{ scaleX: isComplete || isCurrent ? 1 : 0 }}
                                        className="h-full bg-primary origin-left"
                                    />
                                </div>
                            )}

                            {/* Icon */}
                            <motion.div
                                animate={{
                                    scale: isCurrent ? [1, 1.1, 1] : 1,
                                    borderColor: isComplete || isCurrent ? "rgb(139, 92, 246)" : "rgb(51, 65, 85)",
                                }}
                                transition={{ duration: 0.5, repeat: isCurrent ? Infinity : 0 }}
                                className={`
                                    w-10 h-10 rounded-full border-2 flex items-center justify-center mb-2
                                    ${isComplete ? "bg-primary/20 text-primary" : ""}
                                    ${isCurrent ? "bg-primary/30 text-primary" : ""}
                                    ${!isComplete && !isCurrent ? "bg-slate-800 text-slate-500" : ""}
                                `}
                            >
                                {isComplete ? (
                                    <CheckCircle size={18} />
                                ) : (
                                    <Icon size={18} />
                                )}
                            </motion.div>

                            {/* Label */}
                            <span className={`text-xs font-medium ${isCurrent ? "text-primary" : isComplete ? "text-slate-300" : "text-slate-500"}`}>
                                {p.label}
                            </span>
                            <span className="text-[10px] text-slate-500">{p.description}</span>
                        </div>
                    );
                })}
            </div>

            {/* Status Text */}
            <motion.p
                key={phase}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-sm text-slate-400 mt-4"
            >
                {phase === "routing" && "파일 형식을 분석하고 있습니다..."}
                {phase === "analyzing" && "GPT-4o와 Gemini가 교차 검증 중입니다..."}
                {phase === "extracting" && "사진과 개인정보를 추출하고 있습니다..."}
                {phase === "embedding" && "검색용 벡터를 생성하고 있습니다..."}
                {phase === "complete" && "처리가 완료되었습니다!"}
            </motion.p>
        </motion.div>
    );
}

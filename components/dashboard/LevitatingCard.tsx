"use client";

import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { AlertTriangle, User, MoreHorizontal, ThumbsUp, ThumbsDown } from "lucide-react";
import { FLOATING_PHYSICS, HEAVY_APPEAR } from "@/lib/physics";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MagneticButton from "@/components/ui/magnetic-button";

export interface TalentProps {
    id: string | number;
    name: string;
    role: string;
    photoUrl?: string;    // 프로필 사진 URL
    // New props for contextual scoring
    aiConfidence: number; // 0-100
    matchScore?: number;  // 0-100
    riskLevel: 'low' | 'medium' | 'high';
}

interface LevitatingCardProps {
    data: TalentProps;
    index: number;
    isSearchMode?: boolean; // Default to false
    searchQuery?: string;   // For feedback
    onFeedback?: (candidateId: string, type: 'relevant' | 'not_relevant') => void;
}

export default function LevitatingCard({ data, index, isSearchMode = false, searchQuery, onFeedback }: LevitatingCardProps) {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const router = useRouter();
    const [feedbackGiven, setFeedbackGiven] = useState<'relevant' | 'not_relevant' | null>(null);

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top, width, height } = currentTarget.getBoundingClientRect();
        const x = (clientX - left) / width - 0.5;
        const y = (clientY - top) / height - 0.5;

        mouseX.set(x * 10);
        mouseY.set(y * 10);
    }

    function handleMouseLeave() {
        mouseX.set(0);
        mouseY.set(0);
    }

    const handleViewProfile = () => {
        router.push(`/candidates/${data.id}`);
    };

    const handleFeedback = async (type: 'relevant' | 'not_relevant') => {
        if (feedbackGiven) return;

        setFeedbackGiven(type);
        onFeedback?.(String(data.id), type);

        // API 호출
        try {
            await fetch('/api/search/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidateId: data.id,
                    searchQuery: searchQuery || '',
                    feedbackType: type,
                    resultPosition: index,
                    relevanceScore: data.matchScore || 0,
                }),
            });
        } catch (error) {
            console.error('Feedback error:', error);
        }
    };

    // Contextual Data Logic
    const { displayScore, displayLabel, scoreColor } = useMemo(() => {
        // If not in search mode, show AI Confidence. If in search mode, show Match Score (relevance).
        const score = isSearchMode ? (data.matchScore || 0) : data.aiConfidence;
        const label = isSearchMode ? "MATCH SCORE" : "AI CONFIDENCE";

        // PRD v6.0 Color Logic
        // High (95+): Emerald, Medium (80-94): Yellow, Low (<80): Rose
        let color = "text-risk"; // Default Low (< 80)
        if (score >= 95) color = "text-emerald-400";
        else if (score >= 80) color = "text-yellow-400";

        return { displayScore: score, displayLabel: label, scoreColor: color };
    }, [isSearchMode, data.aiConfidence, data.matchScore]);

    // Transform for simple 3D tilt
    // Using explicit transform for performance and clarity
    const transform = useMotionTemplate`perspective(1000px) rotateX(${mouseY}deg) rotateY(${mouseX}deg)`;

    return (
        <motion.div
            initial="initial"
            animate="animate"
            variants={{
                initial: HEAVY_APPEAR.initial,
                animate: {
                    ...HEAVY_APPEAR.animate,
                    transition: { ...HEAVY_APPEAR.transition, delay: index * 0.1 }
                }
            }}
            className="relative group"
        >
            <motion.div
                animate={FLOATING_PHYSICS.y}
                transition={{ ...FLOATING_PHYSICS.y, delay: Math.random() * 2 }}
                style={{ transform, transformStyle: "preserve-3d" }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className={cn(
                    "relative p-6 rounded-2xl bg-[#0F0F24]/60 backdrop-blur-md border transition-all duration-300",
                    data.riskLevel === 'high'
                        ? "border-risk/50 shadow-[0_0_20px_rgba(244,63,94,0.15)] hover:border-risk hover:shadow-[0_0_30px_rgba(244,63,94,0.3)]"
                        : "border-white/5 hover:border-primary/30 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)]"
                )}
            >
                {/* Pulsating Risk Indicator Overlay */}
                {data.riskLevel === 'high' && (
                    <div className="absolute inset-0 rounded-2xl border border-risk/20 animate-pulse pointer-events-none" />
                )}

                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        {/* Profile Photo or Initial Avatar */}
                        {data.photoUrl ? (
                            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-slate-700">
                                <img
                                    src={data.photoUrl}
                                    alt={data.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border border-primary/20 text-primary font-semibold text-sm">
                                {data.name.charAt(0)}
                            </div>
                        )}
                        <div>
                            <h3 className="text-white font-semibold leading-tight">{data.name}</h3>
                            <p className="text-slate-400 text-xs">{data.role}</p>
                        </div>
                    </div>
                    {data.riskLevel === 'high' ? (
                        <div className="flex items-center gap-1 text-risk text-xs font-bold px-2 py-1 bg-risk/10 rounded-full border border-risk/20">
                            <AlertTriangle size={12} />
                            <span>RISK DETECTED</span>
                        </div>
                    ) : (
                        <div className="p-1 text-slate-500 hover:text-white transition-colors cursor-pointer">
                            <MoreHorizontal size={16} />
                        </div>
                    )}
                </div>

                {/* Dynamic Score Section */}
                <div className="flex flex-col items-end mb-4">
                    <span className={cn("text-3xl font-bold font-mono transition-colors duration-300", scoreColor)}>
                        {displayScore}%
                    </span>
                    <span className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
                        {displayLabel}
                    </span>
                </div>

                {/* Actions / Footer */}
                <div className="flex gap-2">
                    <MagneticButton
                        onClick={handleViewProfile}
                        strength={0.4}
                        className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 font-medium border border-white/5"
                    >
                        View Profile
                    </MagneticButton>
                    {data.riskLevel !== 'high' && !isSearchMode && (
                        <MagneticButton
                            strength={0.5}
                            className="flex-1 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-xs text-primary font-medium border border-primary/20"
                        >
                            Contact
                        </MagneticButton>
                    )}
                </div>

                {/* Feedback Buttons (Search Mode Only) */}
                {isSearchMode && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                        <button
                            onClick={() => handleFeedback('relevant')}
                            disabled={feedbackGiven !== null}
                            className={cn(
                                "flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5",
                                feedbackGiven === 'relevant'
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : feedbackGiven
                                    ? "bg-slate-700/30 text-slate-500 cursor-not-allowed"
                                    : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                            )}
                        >
                            <ThumbsUp size={12} />
                            Relevant
                        </button>
                        <button
                            onClick={() => handleFeedback('not_relevant')}
                            disabled={feedbackGiven !== null}
                            className={cn(
                                "flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5",
                                feedbackGiven === 'not_relevant'
                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                    : feedbackGiven
                                    ? "bg-slate-700/30 text-slate-500 cursor-not-allowed"
                                    : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                            )}
                        >
                            <ThumbsDown size={12} />
                            Not Relevant
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}

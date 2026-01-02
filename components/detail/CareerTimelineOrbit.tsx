"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Briefcase, Calendar, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Career {
    company: string;
    position: string;
    startDate: string;
    endDate?: string;
    isCurrent?: boolean;
    description?: string;
    skills?: string[];
}

interface CareerTimelineOrbitProps {
    careers: Career[];
}

export default function CareerTimelineOrbit({ careers }: CareerTimelineOrbitProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    if (!careers || careers.length === 0) {
        return (
            <div className="text-center text-slate-500 py-8">
                경력 정보가 없습니다
            </div>
        );
    }

    return (
        <div className="relative py-4">
            {/* Timeline Line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 via-primary/20 to-transparent" />

            {/* Career Items */}
            <div className="space-y-6">
                {careers.map((career, index) => {
                    const isHovered = hoveredIndex === index;
                    const skills = career.skills || [];

                    return (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            className="relative pl-16"
                        >
                            {/* Planet Node */}
                            <motion.div
                                animate={{
                                    scale: isHovered ? 1.2 : 1,
                                    boxShadow: isHovered
                                        ? "0 0 20px rgba(139, 92, 246, 0.5)"
                                        : "0 0 0px rgba(139, 92, 246, 0)",
                                }}
                                className={cn(
                                    "absolute left-3 top-3 w-6 h-6 rounded-full border-2 transition-colors",
                                    career.isCurrent
                                        ? "bg-primary border-primary"
                                        : "bg-slate-800 border-primary/50"
                                )}
                            >
                                {/* Pulse for current */}
                                {career.isCurrent && (
                                    <motion.div
                                        animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                        className="absolute inset-0 rounded-full bg-primary"
                                    />
                                )}
                            </motion.div>

                            {/* Orbiting Skills (Satellites) */}
                            <AnimatePresence>
                                {isHovered && skills.length > 0 && (
                                    <div className="absolute left-6 top-6 w-0 h-0">
                                        {skills.slice(0, 6).map((skill, skillIndex) => {
                                            const angle = (360 / Math.min(skills.length, 6)) * skillIndex - 90;
                                            const radius = 50 + (skillIndex % 2) * 15;
                                            const x = Math.cos((angle * Math.PI) / 180) * radius;
                                            const y = Math.sin((angle * Math.PI) / 180) * radius;

                                            return (
                                                <motion.div
                                                    key={skillIndex}
                                                    initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                                                    animate={{
                                                        opacity: 1,
                                                        scale: 1,
                                                        x,
                                                        y,
                                                    }}
                                                    exit={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                                                    transition={{
                                                        delay: skillIndex * 0.05,
                                                        type: "spring",
                                                        stiffness: 200,
                                                        damping: 15,
                                                    }}
                                                    className="absolute whitespace-nowrap px-2 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-xs text-primary"
                                                    style={{ transform: "translate(-50%, -50%)" }}
                                                >
                                                    {skill}
                                                </motion.div>
                                            );
                                        })}

                                        {/* More indicator */}
                                        {skills.length > 6 && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0 }}
                                                animate={{ opacity: 1, scale: 1, x: 60, y: 30 }}
                                                exit={{ opacity: 0, scale: 0 }}
                                                transition={{ delay: 0.3 }}
                                                className="absolute whitespace-nowrap px-2 py-0.5 rounded-full bg-slate-700 border border-slate-600 text-xs text-slate-400"
                                                style={{ transform: "translate(-50%, -50%)" }}
                                            >
                                                +{skills.length - 6}
                                            </motion.div>
                                        )}
                                    </div>
                                )}
                            </AnimatePresence>

                            {/* Career Card */}
                            <motion.div
                                animate={{
                                    x: isHovered ? 10 : 0,
                                    backgroundColor: isHovered
                                        ? "rgba(139, 92, 246, 0.1)"
                                        : "rgba(51, 65, 85, 0.3)",
                                }}
                                className={cn(
                                    "p-4 rounded-xl border transition-colors cursor-pointer",
                                    isHovered ? "border-primary/30" : "border-slate-700"
                                )}
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-white">{career.position}</h3>
                                            {career.isCurrent && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                                                    현재
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-400 mt-0.5">{career.company}</p>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-slate-500">
                                        <Calendar size={12} />
                                        <span>
                                            {career.startDate} - {career.isCurrent ? "현재" : career.endDate}
                                        </span>
                                    </div>
                                </div>

                                {career.description && (
                                    <motion.p
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{
                                            height: isHovered ? "auto" : 0,
                                            opacity: isHovered ? 1 : 0,
                                        }}
                                        className="text-sm text-slate-400 mt-2 overflow-hidden"
                                    >
                                        {career.description}
                                    </motion.p>
                                )}

                                {/* Skill Tags (shown when not hovered) */}
                                {!isHovered && skills.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {skills.slice(0, 3).map((skill, i) => (
                                            <span
                                                key={i}
                                                className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400"
                                            >
                                                {skill}
                                            </span>
                                        ))}
                                        {skills.length > 3 && (
                                            <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-500">
                                                +{skills.length - 3}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

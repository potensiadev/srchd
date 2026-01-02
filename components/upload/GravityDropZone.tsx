"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState, useCallback } from "react";
import { Upload, FolderUp, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface GravityDropZoneProps {
    onFilesDropped: (files: FileList) => void;
    accept?: string;
    maxFiles?: number;
    disabled?: boolean;
}

// 파티클 생성 함수
function generateParticles(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        id: i,
        angle: (360 / count) * i,
        radius: 80 + Math.random() * 40,
        size: 2 + Math.random() * 3,
        duration: 3 + Math.random() * 2,
        delay: Math.random() * 2,
    }));
}

export default function GravityDropZone({
    onFilesDropped,
    accept,
    maxFiles = 30,
    disabled = false,
}: GravityDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const particles = useRef(generateParticles(24)).current;

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget === e.target) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (disabled) return;

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            if (files.length > maxFiles) {
                setIsRejected(true);
                setTimeout(() => setIsRejected(false), 1000);
                return;
            }
            onFilesDropped(files);
        }
    }, [disabled, maxFiles, onFilesDropped]);

    const handleClick = () => {
        if (!disabled) fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesDropped(e.target.files);
        }
    };

    return (
        <div
            onClick={handleClick}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
                "relative overflow-hidden rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300",
                "min-h-[300px] flex items-center justify-center",
                isDragging && "scale-[1.02] border-primary",
                isRejected && "border-red-500 bg-red-500/10",
                !isDragging && !isRejected && "border-slate-700 hover:border-slate-600 bg-slate-800/30",
                disabled && "opacity-50 cursor-not-allowed"
            )}
        >
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={accept}
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Background Gradient */}
            <div className={cn(
                "absolute inset-0 transition-opacity duration-500",
                isDragging ? "opacity-100" : "opacity-0"
            )}>
                <div className="absolute inset-0 bg-gradient-radial from-primary/20 via-transparent to-transparent" />
            </div>

            {/* Orbiting Particles */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {particles.map((particle) => (
                    <motion.div
                        key={particle.id}
                        animate={{
                            rotate: [particle.angle, particle.angle + 360],
                        }}
                        transition={{
                            duration: particle.duration,
                            repeat: Infinity,
                            ease: "linear",
                            delay: particle.delay,
                        }}
                        style={{
                            position: "absolute",
                            width: isDragging ? particle.radius * 0.6 : particle.radius,
                            height: isDragging ? particle.radius * 0.6 : particle.radius,
                        }}
                        className="transition-all duration-500"
                    >
                        <motion.div
                            animate={{
                                scale: isDragging ? [1, 1.5, 1] : 1,
                                opacity: isDragging ? [0.3, 0.8, 0.3] : 0.2,
                            }}
                            transition={{
                                duration: 1,
                                repeat: Infinity,
                            }}
                            style={{
                                width: particle.size,
                                height: particle.size,
                            }}
                            className={cn(
                                "absolute top-0 left-1/2 -translate-x-1/2 rounded-full",
                                isDragging ? "bg-primary" : "bg-slate-500"
                            )}
                        />
                    </motion.div>
                ))}
            </div>

            {/* Center Content */}
            <div className="relative z-10 flex flex-col items-center gap-4 p-8">
                {/* Core (Black Hole Center) */}
                <motion.div
                    animate={{
                        scale: isDragging ? [1, 1.2, 1] : 1,
                        boxShadow: isDragging
                            ? [
                                "0 0 20px rgba(139, 92, 246, 0.3)",
                                "0 0 60px rgba(139, 92, 246, 0.6)",
                                "0 0 20px rgba(139, 92, 246, 0.3)",
                            ]
                            : "0 0 0px rgba(139, 92, 246, 0)",
                    }}
                    transition={{ duration: 1, repeat: isDragging ? Infinity : 0 }}
                    className={cn(
                        "p-6 rounded-full transition-colors duration-300",
                        isDragging ? "bg-primary/30" : "bg-slate-700",
                        isRejected && "bg-red-500/30"
                    )}
                >
                    <AnimatePresence mode="wait">
                        {isRejected ? (
                            <motion.div
                                key="rejected"
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                exit={{ scale: 0, rotate: 180 }}
                            >
                                <XCircle size={48} className="text-red-400" />
                            </motion.div>
                        ) : isDragging ? (
                            <motion.div
                                key="dragging"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                                transition={{ rotate: { duration: 0.5, repeat: Infinity } }}
                            >
                                <FolderUp size={48} className="text-primary" />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="idle"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                            >
                                <Upload size={48} className="text-slate-400" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Text */}
                <div className="text-center">
                    <motion.p
                        animate={{ y: isDragging ? -5 : 0 }}
                        className={cn(
                            "text-lg font-medium transition-colors",
                            isDragging ? "text-primary" : "text-white",
                            isRejected && "text-red-400"
                        )}
                    >
                        {isRejected
                            ? "파일이 너무 많습니다"
                            : isDragging
                            ? "여기에 놓으세요"
                            : "이력서 파일을 드래그하거나 클릭하세요"}
                    </motion.p>
                    <p className="text-sm text-slate-400 mt-1">
                        HWP, HWPX, DOC, DOCX, PDF • 최대 50MB • 최대 {maxFiles}개
                    </p>
                </div>
            </div>

            {/* Rejection Pulse Effect */}
            <AnimatePresence>
                {isRejected && (
                    <motion.div
                        initial={{ opacity: 0.5, scale: 0.8 }}
                        animate={{ opacity: 0, scale: 2 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="absolute inset-0 rounded-2xl border-4 border-red-500"
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

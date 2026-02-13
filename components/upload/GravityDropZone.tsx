"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState, useCallback, useMemo } from "react";
import { Upload, FolderUp, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface GravityDropZoneProps {
    onFilesDropped: (files: FileList) => void;
    accept?: string;
    maxFiles?: number;
    disabled?: boolean;
}

// 사전 정의된 파티클 데이터 (렌더 순수성 보장)
const PARTICLE_DATA = [
    { radius: 95, size: 3.5, duration: 4.2, delay: 0.3 },
    { radius: 108, size: 2.8, duration: 3.7, delay: 1.1 },
    { radius: 85, size: 4.1, duration: 4.8, delay: 0.8 },
    { radius: 112, size: 2.3, duration: 3.2, delay: 1.6 },
    { radius: 92, size: 3.9, duration: 4.5, delay: 0.5 },
    { radius: 118, size: 2.6, duration: 3.9, delay: 1.3 },
    { radius: 88, size: 4.4, duration: 4.1, delay: 0.9 },
    { radius: 105, size: 3.1, duration: 3.5, delay: 1.8 },
    { radius: 98, size: 3.7, duration: 4.6, delay: 0.2 },
    { radius: 115, size: 2.4, duration: 3.3, delay: 1.4 },
    { radius: 82, size: 4.2, duration: 4.9, delay: 0.7 },
    { radius: 102, size: 2.9, duration: 3.8, delay: 1.0 },
    { radius: 90, size: 3.6, duration: 4.3, delay: 0.4 },
    { radius: 110, size: 2.7, duration: 3.4, delay: 1.7 },
    { radius: 86, size: 4.0, duration: 4.7, delay: 0.6 },
    { radius: 100, size: 3.2, duration: 3.6, delay: 1.2 },
    { radius: 94, size: 3.8, duration: 4.4, delay: 0.1 },
    { radius: 116, size: 2.5, duration: 3.1, delay: 1.5 },
    { radius: 84, size: 4.3, duration: 5.0, delay: 0.85 },
    { radius: 107, size: 3.0, duration: 3.55, delay: 1.05 },
    { radius: 96, size: 3.4, duration: 4.35, delay: 0.35 },
    { radius: 113, size: 2.65, duration: 3.45, delay: 1.65 },
    { radius: 89, size: 3.95, duration: 4.55, delay: 0.55 },
    { radius: 104, size: 3.15, duration: 3.75, delay: 1.25 },
];

export default function GravityDropZone({
    onFilesDropped,
    accept,
    maxFiles = 30,
    disabled = false,
}: GravityDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // useMemo로 파티클 생성 (렌더 순수성 보장)
    const particles = useMemo(() =>
        PARTICLE_DATA.map((p, i) => ({
            id: i,
            angle: (360 / PARTICLE_DATA.length) * i,
            ...p,
        })),
    []);

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
                isDragging && "scale-[1.02] border-primary bg-primary/5",
                isRejected && "border-red-500 bg-red-50",
                !isDragging && !isRejected && "border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100",
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
                <div className="absolute inset-0 bg-gradient-radial from-primary/10 via-transparent to-transparent" />
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
                                opacity: isDragging ? [0.6, 1, 0.6] : 0.4,
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
                                isDragging ? "bg-primary" : "bg-gray-400"
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
                                "0 0 20px rgba(59, 130, 246, 0.2)",
                                "0 0 60px rgba(59, 130, 246, 0.4)",
                                "0 0 20px rgba(59, 130, 246, 0.2)",
                            ]
                            : "0 0 0px rgba(59, 130, 246, 0)",
                    }}
                    transition={{ duration: 1, repeat: isDragging ? Infinity : 0 }}
                    className={cn(
                        "p-6 rounded-full transition-colors duration-300",
                        isDragging ? "bg-white text-primary shadow-xl" : "bg-white text-gray-400 shadow-sm border border-gray-200",
                        isRejected && "bg-red-50 text-red-500 border-red-100"
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
                                <XCircle size={48} className="text-red-500" />
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
                                <Upload size={48} className="text-gray-400" />
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
                            isDragging ? "text-primary" : "text-gray-900",
                            isRejected && "text-red-500"
                        )}
                    >
                        {isRejected
                            ? "파일이 너무 많습니다"
                            : isDragging
                                ? "여기에 놓으세요"
                                : "이력서 파일을 드래그하거나 클릭하세요"}
                    </motion.p>
                    <p className="text-sm text-gray-500 mt-1">
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

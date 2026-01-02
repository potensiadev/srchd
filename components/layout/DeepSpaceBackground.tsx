"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface Star {
    id: number;
    x: number;
    y: number;
    size: number;
    opacity: number;
    duration: number;
    delay: number;
}

interface Nebula {
    id: number;
    x: number;
    y: number;
    size: number;
    color: string;
    rotation: number;
}

function generateStars(count: number): Star[] {
    return Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.2,
        duration: Math.random() * 3 + 2,
        delay: Math.random() * 2,
    }));
}

function generateNebulas(count: number): Nebula[] {
    const colors = [
        "rgba(139, 92, 246, 0.08)",  // Primary Purple
        "rgba(59, 130, 246, 0.06)",   // Blue
        "rgba(236, 72, 153, 0.05)",   // Pink
        "rgba(34, 211, 238, 0.04)",   // Cyan
    ];

    return Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 400 + 200,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
    }));
}

export default function DeepSpaceBackground() {
    const [stars] = useState(() => generateStars(80));
    const [nebulas] = useState(() => generateNebulas(5));
    const containerRef = useRef<HTMLDivElement>(null);

    // Parallax effect on mouse move
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;

            const { clientWidth, clientHeight } = containerRef.current;
            const x = (e.clientX / clientWidth - 0.5) * 20;
            const y = (e.clientY / clientHeight - 0.5) * 20;

            setMousePosition({ x, y });
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#050510]"
        >
            {/* Base Gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a1f] via-[#050510] to-[#0a0a1f]" />

            {/* Nebula Clouds */}
            <motion.div
                animate={{
                    x: mousePosition.x * 0.5,
                    y: mousePosition.y * 0.5,
                }}
                transition={{ type: "spring", stiffness: 50, damping: 30 }}
                className="absolute inset-0"
            >
                {nebulas.map((nebula) => (
                    <motion.div
                        key={nebula.id}
                        animate={{
                            rotate: [nebula.rotation, nebula.rotation + 360],
                            scale: [1, 1.1, 1],
                        }}
                        transition={{
                            rotate: { duration: 120, repeat: Infinity, ease: "linear" },
                            scale: { duration: 20, repeat: Infinity, ease: "easeInOut" },
                        }}
                        style={{
                            position: "absolute",
                            left: `${nebula.x}%`,
                            top: `${nebula.y}%`,
                            width: nebula.size,
                            height: nebula.size,
                            background: `radial-gradient(ellipse at center, ${nebula.color}, transparent 70%)`,
                            transform: "translate(-50%, -50%)",
                            filter: "blur(40px)",
                        }}
                    />
                ))}
            </motion.div>

            {/* Stars Layer */}
            <motion.div
                animate={{
                    x: mousePosition.x,
                    y: mousePosition.y,
                }}
                transition={{ type: "spring", stiffness: 100, damping: 30 }}
                className="absolute inset-0"
            >
                {stars.map((star) => (
                    <motion.div
                        key={star.id}
                        animate={{
                            opacity: [star.opacity, star.opacity * 1.5, star.opacity],
                            scale: [1, 1.2, 1],
                        }}
                        transition={{
                            duration: star.duration,
                            repeat: Infinity,
                            delay: star.delay,
                            ease: "easeInOut",
                        }}
                        style={{
                            position: "absolute",
                            left: `${star.x}%`,
                            top: `${star.y}%`,
                            width: star.size,
                            height: star.size,
                        }}
                        className="rounded-full bg-white"
                    />
                ))}
            </motion.div>

            {/* Grid Overlay (subtle) */}
            <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)
                    `,
                    backgroundSize: "100px 100px",
                }}
            />

            {/* Vignette */}
            <div
                className="absolute inset-0"
                style={{
                    background: "radial-gradient(ellipse at center, transparent 0%, rgba(5, 5, 16, 0.8) 100%)",
                }}
            />

            {/* Animated Glow Orbs */}
            <motion.div
                animate={{
                    x: [0, 100, 0],
                    y: [0, -50, 0],
                }}
                transition={{
                    duration: 30,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20"
                style={{
                    background: "radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)",
                    filter: "blur(60px)",
                }}
            />
            <motion.div
                animate={{
                    x: [0, -80, 0],
                    y: [0, 60, 0],
                }}
                transition={{
                    duration: 25,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 5,
                }}
                className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-15"
                style={{
                    background: "radial-gradient(circle, rgba(34, 211, 238, 0.3) 0%, transparent 70%)",
                    filter: "blur(60px)",
                }}
            />
        </div>
    );
}

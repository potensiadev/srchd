"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MagneticButtonProps {
    children: ReactNode;
    className?: string;
    strength?: number;      // 자력 강도 (기본: 0.3)
    radius?: number;        // 반응 반경 (기본: 100px)
    onClick?: () => void;
    disabled?: boolean;
}

export default function MagneticButton({
    children,
    className,
    strength = 0.3,
    radius = 100,
    onClick,
    disabled = false,
}: MagneticButtonProps) {
    const ref = useRef<HTMLButtonElement>(null);

    // Motion values for position
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // Spring animation for smooth movement
    const springConfig = { stiffness: 150, damping: 15, mass: 0.1 };
    const springX = useSpring(x, springConfig);
    const springY = useSpring(y, springConfig);

    function handleMouseMove(e: React.MouseEvent) {
        if (!ref.current || disabled) return;

        const rect = ref.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const distanceX = e.clientX - centerX;
        const distanceY = e.clientY - centerY;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        // 반경 내에 있을 때만 반응
        if (distance < radius) {
            const magneticPull = 1 - distance / radius; // 가까울수록 강한 당김
            x.set(distanceX * strength * magneticPull);
            y.set(distanceY * strength * magneticPull);
        }
    }

    function handleMouseLeave() {
        x.set(0);
        y.set(0);
    }

    return (
        <motion.button
            ref={ref}
            onClick={onClick}
            disabled={disabled}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                x: springX,
                y: springY,
            }}
            whileTap={{ scale: 0.95 }}
            className={cn(
                "relative transition-colors",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
        >
            {children}
        </motion.button>
    );
}

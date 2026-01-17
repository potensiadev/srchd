"use client";

import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { Lock } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface PrivacyShieldProps {
    content: React.ReactNode;
    blurCheck?: boolean; // Optional: Force blur state logic if needed externally
}

export default function PrivacyShield({ content, blurCheck = true }: PrivacyShieldProps) {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const [isHovered, setIsHovered] = useState(false);

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    // Mask Image: Transparent circle at mouse position, opaque elsewhere.
    // We use black/transparent for the mask. 
    // "transparent" cuts away the mask (hiding the layer). "black" keeps it.
    // We want the BLUR layer to be hidden at mouse position.
    // So: Radial Gradient -> center transparent, outer black.
    const maskImage = useMotionTemplate`radial-gradient(150px circle at ${mouseX}px ${mouseY}px, transparent 20%, black 100%)`;

    return (
        <div
            className="relative group overflow-hidden rounded-xl border border-white/10 bg-white/5"
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* 1. Underlying CLEAR Content */}
            <div className="p-6 relative z-10">
                {content}
            </div>

            {/* 2. BLURRED Overlay (Masked) */}
            <motion.div
                style={{ maskImage }}
                className="absolute inset-0 z-20 backdrop-blur-xl bg-black/20 flex items-center justify-center pointer-events-none"
            >
                {/* Placeholder for the blurred content visualization if needed, or just let the backdrop-blur do the work on the underlying content? 
            Backdrop-blur filters the content *behind* it. 
            So we just need this overlay to exist.
            BUT, if we punch a hole in this overlay using maskImage, the blur filter is removed at that hole.
            This works perfectly.
        */}

                {/* Locked Icon - Hide when hovered/revealed near it? Or just keep it? 
            User said "The blur should clear only at the exact mouse position".
            We might want the icon to float or fade out.
        */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                        animate={{ opacity: isHovered ? 0.3 : 1, scale: isHovered ? 0.8 : 1 }}
                        className="flex flex-col items-center gap-2 text-gray-400"
                    >
                        <Lock size={24} />
                        <span className="text-xs uppercase tracking-widest font-bold">Protected PII</span>
                    </motion.div>
                </div>
            </motion.div>

            {/* 3. Flashlight Glow (Optional, adds "Liquid" feel) */}
            <motion.div
                className="absolute inset-0 z-30 pointer-events-none bg-primary/10"
                style={{
                    background: useMotionTemplate`radial-gradient(100px circle at ${mouseX}px ${mouseY}px, rgba(139,92,246,0.15), transparent 80%)`,
                    opacity: isHovered ? 1 : 0
                }}
            />
        </div>
    );
}

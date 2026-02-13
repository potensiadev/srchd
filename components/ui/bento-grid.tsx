"use client";

import { cn } from "@/lib/utils";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { LucideIcon } from "lucide-react";
import React from "react";

export const BentoGrid = ({
    className,
    children,
}: {
    className?: string;
    children?: React.ReactNode;
}) => {
    return (
        <div
            className={cn(
                "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto ",
                className
            )}
        >
            {children}
        </div>
    );
};

export const BentoGridItem = ({
    className,
    title,
    description,
    header,
    icon: Icon,
    details,
}: {
    className?: string;
    title?: string | React.ReactNode;
    description?: string | React.ReactNode;
    header?: React.ReactNode;
    icon?: LucideIcon;
    details?: string[];
}) => {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({
        currentTarget,
        clientX,
        clientY,
    }: React.MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <div
            className={cn(
                "row-span-1 rounded-xl group/bento hover:shadow-xl transition duration-200 shadow-input dark:shadow-none p-4 bg-white border border-gray-100 justify-between flex flex-col space-y-4 relative overflow-hidden",
                className
            )}
            onMouseMove={handleMouseMove}
        >
            {/* Spotlight Effect */}
            <motion.div
                className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-300 group-hover/bento:opacity-100"
                style={{
                    background: useMotionTemplate`
            radial-gradient(
              650px circle at ${mouseX}px ${mouseY}px,
              rgba(37, 99, 235, 0.1),
              transparent 80%
            )
          `,
                }}
            />

            {/* Header Content (Image or Visual) */}
            <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-50 to-neutral-100 border border-neutral-100 relative group-hover/bento:border-blue-100 transition-colors">
                {header}
            </div>

            {/* Text Content */}
            <div className="group-hover/bento:translate-x-2 transition duration-200 relative z-10">
                <div className="flex items-center gap-2 mb-2">
                    {Icon && <Icon className="h-4 w-4 text-slate-500" />}
                    <div className="font-sans font-bold text-neutral-600 mb-0 mt-0">
                        {title}
                    </div>
                </div>
                <div className="font-sans font-normal text-neutral-600 text-xs mb-3">
                    {description}
                </div>

                {/* Details List */}
                {details && details.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {details.map((detail, idx) => (
                            <span
                                key={idx}
                                className="text-[10px] px-2 py-1 bg-slate-50 text-slate-500 rounded-full border border-slate-100 group-hover/bento:bg-blue-50 group-hover/bento:text-blue-600 group-hover/bento:border-blue-100 transition-colors"
                            >
                                {detail}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

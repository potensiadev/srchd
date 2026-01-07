"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, Cpu, ChevronLeft, ChevronRight, Maximize2, Minimize2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SplitViewerProps {
    pdfUrl?: string;
    isLoading?: boolean;
    children: React.ReactNode;  // AI 분석 결과 (CandidateReviewPanel)
}

export default function SplitViewer({ pdfUrl, isLoading = false, children }: SplitViewerProps) {
    const [splitRatio, setSplitRatio] = useState(50); // 0-100
    const [isCollapsed, setIsCollapsed] = useState<"left" | "right" | null>(null);

    const toggleCollapse = (side: "left" | "right") => {
        if (isCollapsed === side) {
            setIsCollapsed(null);
            setSplitRatio(50);
        } else {
            setIsCollapsed(side);
            setSplitRatio(side === "left" ? 5 : 95);
        }
    };

    const leftWidth = isCollapsed === "left" ? 5 : isCollapsed === "right" ? 95 : splitRatio;
    const rightWidth = 100 - leftWidth;

    return (
        <div className="flex h-[calc(100vh-200px)] min-h-[600px] gap-2 rounded-2xl overflow-hidden bg-slate-900/50 border border-slate-700">
            {/* Left Pane - PDF Viewer */}
            <motion.div
                animate={{ width: `${leftWidth}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative flex flex-col bg-slate-800/50 rounded-l-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-slate-700">
                    <div className="flex items-center gap-2 text-slate-300">
                        <FileText size={16} />
                        <span className="text-sm font-medium">원본 문서</span>
                    </div>
                    <button
                        onClick={() => toggleCollapse("left")}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    >
                        {isCollapsed === "left" ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </button>
                </div>

                {/* PDF Content */}
                <div className="flex-1 overflow-auto p-4">
                    {isCollapsed === "left" ? (
                        <button
                            onClick={() => toggleCollapse("left")}
                            className="w-full h-full flex items-center justify-center"
                        >
                            <ChevronRight size={20} className="text-slate-500" />
                        </button>
                    ) : isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                            <Loader2 size={48} className="mb-4 animate-spin text-primary" />
                            <p className="text-sm">원본 이력서를 불러오고 있습니다.</p>
                        </div>
                    ) : pdfUrl ? (
                        <iframe
                            src={pdfUrl}
                            className="w-full h-full rounded-lg border border-slate-600"
                            title="PDF Viewer"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                            <FileText size={48} className="mb-4 opacity-50" />
                            <p className="text-sm">PDF 미리보기를 사용할 수 없습니다</p>
                            <p className="text-xs mt-1 text-slate-600">
                                원본 파일이 PDF가 아니거나<br />미리보기가 지원되지 않습니다
                            </p>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Divider / Drag Handle */}
            <div
                className="w-1 cursor-col-resize bg-slate-700 hover:bg-primary/50 transition-colors flex items-center justify-center"
                onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const startRatio = splitRatio;
                    const container = e.currentTarget.parentElement;
                    if (!container) return;

                    const onMouseMove = (moveEvent: MouseEvent) => {
                        const containerRect = container.getBoundingClientRect();
                        const deltaX = moveEvent.clientX - startX;
                        const deltaPercent = (deltaX / containerRect.width) * 100;
                        const newRatio = Math.min(90, Math.max(10, startRatio + deltaPercent));
                        setSplitRatio(newRatio);
                        setIsCollapsed(null);
                    };

                    const onMouseUp = () => {
                        document.removeEventListener("mousemove", onMouseMove);
                        document.removeEventListener("mouseup", onMouseUp);
                    };

                    document.addEventListener("mousemove", onMouseMove);
                    document.addEventListener("mouseup", onMouseUp);
                }}
            >
                <div className="w-0.5 h-8 bg-slate-500 rounded-full" />
            </div>

            {/* Right Pane - AI Analysis */}
            <motion.div
                animate={{ width: `${rightWidth}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative flex flex-col bg-slate-800/30 rounded-r-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-slate-700">
                    <div className="flex items-center gap-2 text-slate-300">
                        <Cpu size={16} className="text-primary" />
                        <span className="text-sm font-medium">AI 분석 결과</span>
                    </div>
                    <button
                        onClick={() => toggleCollapse("right")}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    >
                        {isCollapsed === "right" ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </button>
                </div>

                {/* Analysis Content */}
                <div className="flex-1 overflow-auto">
                    {isCollapsed === "right" ? (
                        <button
                            onClick={() => toggleCollapse("right")}
                            className="w-full h-full flex items-center justify-center"
                        >
                            <ChevronLeft size={20} className="text-slate-500" />
                        </button>
                    ) : (
                        <div className="p-4">
                            {children}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { FileText, Cpu, ChevronLeft, ChevronRight, Maximize2, Minimize2, Loader2 } from "lucide-react";

// Dynamic import to avoid SSR issues with pdfjs-dist
const PDFViewer = dynamic(() => import("@/components/ui/PDFViewer"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
    ),
});

interface SplitViewerProps {
    pdfUrl?: string;
    isLoading?: boolean;
    highlightKeyword?: string | null;
    children: React.ReactNode;
}

export default function SplitViewer({ pdfUrl, isLoading = false, highlightKeyword, children }: SplitViewerProps) {
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
        <div className="flex h-[calc(100vh-200px)] min-h-[600px] gap-0 rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm">
            {/* Left Pane - PDF Viewer */}
            <motion.div
                animate={{ width: `${leftWidth}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative flex flex-col bg-gray-50 overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white">
                    <div className="flex items-center gap-2 text-gray-700">
                        <FileText size={16} className="text-gray-500" />
                        <span className="text-sm font-semibold">원본 문서</span>
                    </div>
                    <button
                        onClick={() => toggleCollapse("left")}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                    >
                        {isCollapsed === "left" ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </button>
                </div>

                {/* PDF Content */}
                <div className="flex-1 overflow-auto p-4">
                    {isCollapsed === "left" ? (
                        <button
                            onClick={() => toggleCollapse("left")}
                            className="w-full h-full flex items-center justify-center hover:bg-gray-100 transition-colors"
                        >
                            <ChevronRight size={20} className="text-gray-400" />
                        </button>
                    ) : isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                            <Loader2 size={48} className="mb-4 animate-spin text-primary" />
                            <p className="text-sm font-medium">원본 이력서를 불러오고 있습니다.</p>
                        </div>
                    ) : pdfUrl ? (
                        // Using the new PDFViewer with highlighting support
                        // Note: We need to pass highlightKeyword prop if available. 
                        // For now, let's keep it simple and update the parent later to pass it.
                        // Actually, SplitViewerProps doesn't have highlightKeyword yet.
                        <div className="w-full h-full rounded-lg border border-gray-200 shadow-sm bg-gray-50 overflow-hidden">
                            <PDFViewer url={pdfUrl} highlightKeyword={highlightKeyword} />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                            <FileText size={48} className="mb-4 opacity-20" />
                            <p className="text-sm font-medium text-gray-500">PDF 미리보기를 사용할 수 없습니다</p>
                            <p className="text-xs mt-1 text-gray-400">
                                원본 파일이 PDF가 아니거나<br />미리보기가 지원되지 않습니다
                            </p>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Divider / Drag Handle */}
            <div
                className="w-1 cursor-col-resize bg-gray-200 hover:bg-primary transition-colors flex items-center justify-center z-10"
                onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const startRatio = splitRatio;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const container = (e.currentTarget.parentElement as any);
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
                <div className="w-0.5 h-8 bg-gray-300 rounded-full" />
            </div>

            {/* Right Pane - AI Analysis */}
            <motion.div
                animate={{ width: `${rightWidth}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative flex flex-col bg-white overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white">
                    <div className="flex items-center gap-2 text-gray-700">
                        <Cpu size={16} className="text-primary" />
                        <span className="text-sm font-semibold">AI 분석 결과</span>
                    </div>
                    <button
                        onClick={() => toggleCollapse("right")}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                    >
                        {isCollapsed === "right" ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </button>
                </div>

                {/* Analysis Content */}
                <div className="flex-1 overflow-auto bg-gray-50/30">
                    {isCollapsed === "right" ? (
                        <button
                            onClick={() => toggleCollapse("right")}
                            className="w-full h-full flex items-center justify-center hover:bg-gray-100 transition-colors"
                        >
                            <ChevronLeft size={20} className="text-gray-400" />
                        </button>
                    ) : (
                        <div className="p-6">
                            {children}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

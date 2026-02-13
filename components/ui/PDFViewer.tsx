"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF worker - use unpkg CDN with matching version from react-pdf
// pdfjs.version comes from react-pdf's bundled pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Standard A4 width in points (595 points at 72 DPI)
const PDF_DEFAULT_WIDTH = 595;

interface PDFViewerProps {
    url: string;
    highlightKeyword?: string | null;
    className?: string;
    /** 페이지 핸들러 모드 사용 (true: 한 페이지씩, false: 스크롤) */
    usePagination?: boolean;
}

export default function PDFViewer({ url, highlightKeyword, className = "", usePagination = true }: PDFViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [scale, setScale] = useState<number | null>(null); // null = auto-fit
    const [containerWidth, setContainerWidth] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    // Measure container width for auto-fit
    useEffect(() => {
        const updateWidth = () => {
            if (containerRef.current) {
                // Account for padding (p-4 = 16px * 2)
                const width = containerRef.current.clientWidth - 32;
                setContainerWidth(width);
            }
        };

        updateWidth();
        window.addEventListener("resize", updateWidth);
        return () => window.removeEventListener("resize", updateWidth);
    }, []);

    // Calculate auto-fit scale
    const autoFitScale = containerWidth > 0 ? containerWidth / PDF_DEFAULT_WIDTH : 1;
    const effectiveScale = scale ?? autoFitScale;

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
        setCurrentPage(1);
        setError(null);
    }

    // 페이지 네비게이션 함수
    const goToPrevPage = useCallback(() => {
        setCurrentPage((prev) => Math.max(1, prev - 1));
    }, []);

    const goToNextPage = useCallback(() => {
        setCurrentPage((prev) => Math.min(numPages || 1, prev + 1));
    }, [numPages]);

    const goToPage = useCallback((page: number) => {
        if (numPages) {
            setCurrentPage(Math.max(1, Math.min(numPages, page)));
        }
    }, [numPages]);

    // 키보드 네비게이션
    useEffect(() => {
        if (!usePagination) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                goToPrevPage();
            } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                goToNextPage();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [usePagination, goToPrevPage, goToNextPage]);

    function onDocumentLoadError(err: Error) {
        console.error("PDF Load Error:", err);
        setError("PDF 파일을 불러올 수 없습니다.");
    }

    // Custom text renderer for highlighting
    const textRenderer = useCallback(
        (textItem: { str: string }) => {
            if (!highlightKeyword) return textItem.str;

            const str = textItem.str;
            const lowerStr = str.toLowerCase();
            const lowerKeyword = highlightKeyword.toLowerCase();

            if (!lowerStr.includes(lowerKeyword)) return str;

            // Simple highlight implementation
            // Note: This replaces the entire text item with highlighted HTML if it matches
            // Ideally we would split carefully, but React-PDF expects a string returned.
            // Wait, customTextRenderer returns a ReactNode? No, strictly string.
            // Actually, rect-pdf's `customTextRenderer` returns a React Element or string.
            // BUT, checking the types, it says `(textItem: TextItem) => React.ReactNode`.

            const parts = str.split(new RegExp(`(${highlightKeyword})`, "gi"));

            return (
                <>
                    {parts.map((part, index) =>
                        part.toLowerCase() === lowerKeyword ? (
                            <mark key={index} className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
                                {part}
                            </mark>
                        ) : (
                            part
                        )
                    )}
                </>
            );
        },
        [highlightKeyword]
    );

    // NOTE: react-pdf 9.x changes customTextRenderer signature to Promise or something else?
    // Let's stick to the simpler `customTextRenderer` if supported.
    // Ideally, we just use the default text layer and CSS highlighting by injecting a style block or using DOM manipulation if needed.
    // But standard approach is customTextRenderer. 

    return (
        <div className={`flex flex-col h-full bg-gray-50 ${className}`}>
            {/* Toolbar */}
            <div className="flex items-center justify-between p-2 bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-2">
                    {highlightKeyword && (
                        <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full font-medium">
                            검색: &quot;{highlightKeyword}&quot;
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setScale((p) => Math.max(0.5, (p ?? autoFitScale) - 0.1))}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                        title="축소"
                    >
                        <ZoomOut size={16} />
                    </button>
                    <button
                        onClick={() => setScale(null)}
                        className={`text-xs font-mono px-2 py-1 rounded text-center min-w-[48px] transition-colors ${
                            scale === null
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-gray-600 hover:bg-gray-100"
                        }`}
                        title="화면에 맞춤"
                    >
                        {scale === null ? "자동" : `${Math.round(effectiveScale * 100)}%`}
                    </button>
                    <button
                        onClick={() => setScale((p) => Math.min(3.0, (p ?? autoFitScale) + 0.1))}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                        title="확대"
                    >
                        <ZoomIn size={16} />
                    </button>
                    {scale !== null && (
                        <button
                            onClick={() => setScale(null)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                            title="화면에 맞춤"
                        >
                            <Maximize2 size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* 페이지 핸들러 - 상단 */}
            {usePagination && numPages && numPages > 1 && (
                <div className="flex items-center justify-center gap-3 py-2 bg-white border-b border-gray-100">
                    <button
                        onClick={goToPrevPage}
                        disabled={currentPage <= 1}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title="이전 페이지 (←)"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={1}
                            max={numPages}
                            value={currentPage}
                            onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                            className="w-12 text-center text-sm font-medium border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                        <span className="text-sm text-gray-500">/ {numPages}</span>
                    </div>
                    <button
                        onClick={goToNextPage}
                        disabled={currentPage >= numPages}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title="다음 페이지 (→)"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}

            {/* Content Area */}
            <div ref={containerRef} className={`flex-1 overflow-auto p-4 flex justify-center ${usePagination ? 'items-start' : ''}`}>
                {error ? (
                    <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                        <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                        <p>{error}</p>
                    </div>
                ) : (
                    <Document
                        file={url}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={onDocumentLoadError}
                        loading={
                            <div className="flex items-center justify-center p-12">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        }
                        error={
                            <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                                <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                                <p>PDF 파일을 불러올 수 없습니다.</p>
                            </div>
                        }
                        className="flex flex-col gap-4"
                    >
                        {usePagination ? (
                            // 페이지 핸들러 모드: 현재 페이지만 표시
                            <div className="shadow-md">
                                <Page
                                    pageNumber={currentPage}
                                    scale={effectiveScale}
                                    renderTextLayer={true}
                                    renderAnnotationLayer={true}
                                    customTextRenderer={highlightKeyword ? (textRenderer as any) : undefined}
                                    className="bg-white"
                                />
                            </div>
                        ) : (
                            // 스크롤 모드: 모든 페이지 표시
                            Array.from(new Array(numPages || 0), (_, index) => (
                                <div key={`page_${index + 1}`} className="shadow-md">
                                    <Page
                                        pageNumber={index + 1}
                                        scale={effectiveScale}
                                        renderTextLayer={true}
                                        renderAnnotationLayer={true}
                                        customTextRenderer={highlightKeyword ? (textRenderer as any) : undefined}
                                        className="bg-white"
                                    />
                                </div>
                            ))
                        )}
                    </Document>
                )}
            </div>

            {/* 페이지 핸들러 - 하단 (페이지 슬라이더) */}
            {usePagination && numPages && numPages > 1 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-white border-t border-gray-200">
                    <span className="text-xs text-gray-400 min-w-[20px]">1</span>
                    <input
                        type="range"
                        min={1}
                        max={numPages}
                        value={currentPage}
                        onChange={(e) => setCurrentPage(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                        style={{
                            background: `linear-gradient(to right, var(--color-primary, #6366f1) 0%, var(--color-primary, #6366f1) ${((currentPage - 1) / (numPages - 1)) * 100}%, #e5e7eb ${((currentPage - 1) / (numPages - 1)) * 100}%, #e5e7eb 100%)`
                        }}
                    />
                    <span className="text-xs text-gray-400 min-w-[20px] text-right">{numPages}</span>
                </div>
            )}
        </div>
    );
}

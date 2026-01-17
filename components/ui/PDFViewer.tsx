"use client";

import { useState, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2, AlertCircle, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF worker - use CDN with matching version from react-pdf
// pdfjs.version comes from react-pdf's bundled pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PDFViewerProps {
    url: string;
    highlightKeyword?: string | null;
    className?: string;
}

export default function PDFViewer({ url, highlightKeyword, className = "" }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number | null>(null);
    const [scale, setScale] = useState(1.2);
    const [error, setError] = useState<string | null>(null);
    const [matchCount, setMatchCount] = useState(0);

    // Reset match count when keyword changes
    useEffect(() => {
        setMatchCount(0);
    }, [highlightKeyword]);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
        setError(null);
    }

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
                            검색: "{highlightKeyword}"
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setScale((p) => Math.max(0.5, p - 0.1))}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                        title="축소"
                    >
                        <ZoomOut size={16} />
                    </button>
                    <span className="text-xs font-mono w-12 text-center text-gray-600">
                        {Math.round(scale * 100)}%
                    </span>
                    <button
                        onClick={() => setScale((p) => Math.min(3.0, p + 0.1))}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                        title="확대"
                    >
                        <ZoomIn size={16} />
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-auto p-4 flex justify-center">
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
                        {Array.from(new Array(numPages || 0), (_, index) => (
                            <div key={`page_${index + 1}`} className="shadow-md">
                                <Page
                                    pageNumber={index + 1}
                                    scale={scale}
                                    renderTextLayer={true}
                                    renderAnnotationLayer={true}
                                    customTextRenderer={highlightKeyword ? (textRenderer as any) : undefined}
                                    className="bg-white"
                                />
                            </div>
                        ))}
                    </Document>
                )}
            </div>
        </div>
    );
}

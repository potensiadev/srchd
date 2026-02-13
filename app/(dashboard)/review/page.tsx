"use client";

import { useEffect, useState, useCallback } from "react";
import {
    ShieldAlert,
    CheckCircle2,
    AlertTriangle,
    ChevronRight,
    Search,
    ArrowRight,
    ExternalLink,
    Loader2,
    RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { CandidateListItem } from "@/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function ReviewQueuePage() {
    const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchReviewQueue = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/candidates/review");
            if (res.ok) {
                const data = await res.json();
                setCandidates(data.data || []);
                if (data.data?.length > 0 && !selectedId) {
                    setSelectedId(data.data[0].id);
                }
            }
        } catch (error) {
            console.error("Failed to fetch review queue", error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedId]);

    useEffect(() => {
        fetchReviewQueue();
    }, [fetchReviewQueue]);

    const selectedCandidate = candidates.find(c => c.id === selectedId);

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        Review Queue
                        <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
                            {candidates.length} Pending
                        </span>
                    </h1>
                    <p className="text-gray-500 mt-1">
                        AI 신뢰도가 낮거나 충돌이 발생한 데이터들을 검토하고 확정하세요.
                    </p>
                </div>
                <button
                    onClick={fetchReviewQueue}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                    <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden min-h-0">
                {/* Sidebar: Candidate List */}
                <div className="w-1/3 flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Queue 내 검색..."
                                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {isLoading && candidates.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
                                <Loader2 className="animate-spin" />
                                <p className="text-sm">Loading queue...</p>
                            </div>
                        ) : candidates.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center p-6">
                                <CheckCircle2 size={40} className="text-emerald-500 mb-3" />
                                <p className="font-semibold text-gray-900">검토할 항목이 없습니다!</p>
                                <p className="text-sm">모든 데이터가 높은 신뢰도로 처리되었습니다.</p>
                            </div>
                        ) : (
                            candidates.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedId(c.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                                        selectedId === c.id
                                            ? "bg-primary/5 border border-primary/20 shadow-sm"
                                            : "hover:bg-gray-50 border border-transparent"
                                    )}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 shrink-0">
                                        {c.name[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                                        <p className="text-xs text-gray-500 truncate">{c.role}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                            {c.aiConfidence}%
                                        </span>
                                        <ChevronRight size={14} className={cn(
                                            "transition-transform",
                                            selectedId === c.id ? "text-primary translate-x-1" : "text-gray-300"
                                        )} />
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Main Content: Comparison Editor */}
                <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden relative">
                    <AnimatePresence mode="wait">
                        {selectedCandidate ? (
                            <motion.div
                                key={selectedCandidate.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex flex-col h-full"
                            >
                                {/* Editor Header */}
                                <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                            <ShieldAlert size={24} />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900">{selectedCandidate.name}</h2>
                                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                                                <span>{selectedCandidate.company}</span>
                                                <span>•</span>
                                                <span className="flex items-center gap-1 text-red-500 font-medium">
                                                    <AlertTriangle size={14} />
                                                    신뢰도 낮음
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Link
                                            href={`/candidates/${selectedCandidate.id}`}
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
                                        >
                                            <ExternalLink size={16} />
                                            상세 보기
                                        </Link>
                                        <button className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors shadow-sm">
                                            검토 완료 및 확정
                                        </button>
                                    </div>
                                </div>

                                {/* Editor Content */}
                                <div className="flex-1 overflow-y-auto p-8 bg-gray-50/30">
                                    <div className="max-w-3xl mx-auto space-y-8">
                                        {/* Placeholder for specific field review */}
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">검토 필요 필드</h3>

                                            {/* Name Review Card */}
                                            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-700">이름 (Name)</span>
                                                    <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">모델 불일치</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] text-gray-400 font-bold uppercase">Original AI</label>
                                                        <div className="p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-sm text-gray-600 line-through">
                                                            {selectedCandidate.name} (추정)
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5 text-primary">
                                                        <label className="text-[10px] text-primary/50 font-bold uppercase">Suggested (Gemini)</label>
                                                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-sm font-medium">
                                                            {selectedCandidate.name}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <button className="text-[11px] font-bold text-gray-400 hover:text-gray-600">무시</button>
                                                    <button className="text-[11px] font-bold text-primary hover:underline">수정 사항 반영</button>
                                                </div>
                                            </div>

                                            {/* Exp Review Card */}
                                            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-700">경력 연수 (Exp Years)</span>
                                                    <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold">신뢰도 72%</span>
                                                </div>
                                                <div className="grid grid-cols-1 gap-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex-1 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-600">
                                                            {selectedCandidate.expYears} 년
                                                        </div>
                                                        <ArrowRight className="text-gray-300" size={20} />
                                                        <input
                                                            type="number"
                                                            defaultValue={selectedCandidate.expYears}
                                                            className="flex-1 p-3 bg-white rounded-lg border-2 border-primary/30 focus:border-primary text-sm font-bold outline-none"
                                                        />
                                                    </div>
                                                    <p className="text-[11px] text-gray-400 italic">
                                                        💡 팁: 전체 경력 텍스트에서 날짜 중복이 감지되어 자동 조정이 필요할 수 있습니다.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quick Preview of Rest */}
                                        <div className="p-5 bg-gray-100/50 rounded-xl border border-dashed border-gray-200 opacity-60">
                                            <h3 className="text-xs font-bold text-gray-400 uppercase mb-4">기타 데이터 요약</h3>
                                            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                                <div>
                                                    <label className="text-[10px] text-gray-400 font-bold">최근 회사</label>
                                                    <p className="text-sm font-medium">{selectedCandidate.company}</p>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-gray-400 font-bold">스킬</label>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {selectedCandidate.skills.slice(0, 3).map(s => (
                                                            <span key={s} className="text-[10px] px-1.5 py-0.5 bg-white border border-gray-200 rounded">{s}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50/30">
                                <ShieldAlert size={64} className="mb-4 opacity-10" />
                                <p>좌측 리스트에서 검토할 항목을 선택해 주세요.</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

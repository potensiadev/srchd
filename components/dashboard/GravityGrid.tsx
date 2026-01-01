"use client";

import { motion } from "framer-motion";
import { Loader2, AlertCircle, Search } from "lucide-react";
import LevitatingCard from "./LevitatingCard";
import { useCandidates } from "@/hooks";
import type { CandidateListItem, CandidateSearchResult } from "@/types";

interface GravityGridProps {
    isSearchMode?: boolean;
    searchResults?: CandidateSearchResult[];
    isSearching?: boolean;
    searchQuery?: string;
}

/**
 * CandidateListItem을 LevitatingCard의 TalentProps로 변환
 */
function toTalentProps(candidate: CandidateListItem | CandidateSearchResult) {
    return {
        id: candidate.id,
        name: candidate.name,
        role: candidate.role || "Unknown",
        aiConfidence: candidate.aiConfidence,
        matchScore: "matchScore" in candidate ? candidate.matchScore : 0,
        riskLevel: candidate.riskLevel,
    };
}

export default function GravityGrid({
    isSearchMode = false,
    searchResults,
    isSearching = false,
    searchQuery = "",
}: GravityGridProps) {
    // 검색 모드가 아닐 때만 후보자 목록 조회
    const { data, isLoading, error } = useCandidates({
        enabled: !isSearchMode,
    });

    // 로딩 상태
    if (isLoading || isSearching) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                    <Loader2 className="w-8 h-8 text-primary" />
                </motion.div>
                <p className="text-slate-400 text-sm">
                    {isSearching ? "Searching candidates..." : "Loading candidates..."}
                </p>
            </div>
        );
    }

    // 에러 상태
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <AlertCircle className="w-12 h-12 text-rose-400" />
                <p className="text-rose-400 text-sm">{error.message}</p>
            </div>
        );
    }

    // 데이터 결정: 검색 모드면 searchResults, 아니면 API 데이터
    const candidates = isSearchMode
        ? searchResults || []
        : data?.candidates || [];

    // 빈 상태
    if (candidates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Search className="w-12 h-12 text-slate-600" />
                <p className="text-slate-400 text-sm">
                    {isSearchMode
                        ? "No candidates found. Try a different search."
                        : "No candidates yet. Upload resumes to get started."}
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
            {candidates.map((candidate, index) => (
                <LevitatingCard
                    key={candidate.id}
                    data={toTalentProps(candidate)}
                    index={index}
                    isSearchMode={isSearchMode}
                    searchQuery={searchQuery}
                />
            ))}
        </div>
    );
}

"use client";

import { motion } from "framer-motion";
import { Loader2, AlertCircle, Search, Upload, FolderOpen } from "lucide-react";
import Link from "next/link";
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
        photoUrl: candidate.photoUrl,
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
        // 검색 모드: 검색 결과 없음
        if (isSearchMode) {
            return (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Search className="w-12 h-12 text-slate-600" />
                    <p className="text-slate-400 text-sm">
                        검색 결과가 없습니다. 다른 검색어를 시도해보세요.
                    </p>
                </div>
            );
        }

        // 일반 모드: 후보자 없음 - 업로드 유도
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 gap-6"
            >
                <div className="p-6 rounded-full bg-primary/10 border border-primary/20">
                    <FolderOpen className="w-16 h-16 text-primary/60" />
                </div>
                <div className="text-center space-y-2">
                    <h3 className="text-xl font-semibold text-white">
                        아직 등록된 후보자가 없습니다
                    </h3>
                    <p className="text-slate-400 text-sm max-w-md">
                        이력서를 업로드하면 AI가 자동으로 분석하여<br />
                        후보자 정보를 추출하고 검색 가능하게 만듭니다.
                    </p>
                </div>
                <Link
                    href="/upload"
                    className="flex items-center gap-2 px-6 py-3 rounded-xl
                             bg-primary hover:bg-primary/90 text-white font-medium
                             transition-all shadow-lg shadow-primary/25
                             hover:shadow-xl hover:shadow-primary/30 hover:scale-105"
                >
                    <Upload size={20} />
                    첫 이력서 업로드하기
                </Link>
            </motion.div>
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

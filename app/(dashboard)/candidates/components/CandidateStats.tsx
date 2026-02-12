"use client";

import { Users, Briefcase, Calendar } from "lucide-react";
import type { CandidatesStats } from "@/lib/candidates/types";

interface CandidateStatsProps {
  stats: CandidatesStats;
}

export function CandidateStats({ stats }: CandidateStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-sm text-gray-500">전체 후보자</p>
          </div>
        </div>
      </div>
      <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Briefcase className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.needsReview}</p>
            <p className="text-sm text-gray-500">검토 필요</p>
          </div>
        </div>
      </div>
      <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.recentWeek}</p>
            <p className="text-sm text-gray-500">최근 7일</p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Building2, Briefcase, Code } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Candidate } from "@/lib/candidates/types";
import { calculateTotalExperience, formatExperience } from "@/lib/candidates/career-utils";

interface CandidateCardProps {
  candidate: Candidate;
}

export function CandidateCard({ candidate }: CandidateCardProps) {
  return (
    <Link
      href={`/candidates/${candidate.id}`}
      data-testid="candidate-item"
      className="group p-5 rounded-2xl bg-white
               border border-gray-100 hover:border-primary
               transition-all duration-300 hover:shadow-lg hover:shadow-primary/5
               hover:-translate-y-1 block h-full"
    >
      {/* Card Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10
                        flex items-center justify-center text-primary font-semibold text-lg
                        group-hover:bg-primary group-hover:text-white transition-all">
            {candidate.name?.charAt(0) || "?"}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">
              {candidate.name || "이름 미확인"}
            </h3>
            <p className="text-sm text-gray-500">
              {candidate.last_position || "직책 미확인"}
            </p>
          </div>
        </div>
        {/* Confidence Badge */}
        <span
          className={cn(
            "px-2 py-1 rounded-full text-xs font-medium border",
            candidate.confidence_score >= 0.95
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : candidate.confidence_score >= 0.8
              ? "bg-yellow-50 text-yellow-700 border-yellow-200"
              : "bg-red-50 text-red-700 border-red-200"
          )}
          data-testid="ai-confidence"
        >
          {Math.round((candidate.confidence_score || 0) * 100)}%
        </span>
      </div>

      {/* Company & Experience */}
      <div className="flex items-center gap-4 mb-3 text-sm">
        {candidate.last_company && (
          <span className="flex items-center gap-1.5 text-gray-700" data-testid="candidate-company">
            <Building2 className="w-4 h-4 text-gray-400" />
            {candidate.last_company}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-gray-700" data-testid="candidate-exp-years">
          <Briefcase className="w-4 h-4 text-gray-400" />
          {formatExperience(calculateTotalExperience(candidate.careers || []))}
        </span>
      </div>

      {/* Summary */}
      {candidate.summary && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
          {candidate.summary}
        </p>
      )}

      {/* Skills */}
      {candidate.skills && candidate.skills.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="candidate-skills">
          <Code className="w-4 h-4 text-gray-400" />
          {candidate.skills.slice(0, 3).map((skill, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-600"
            >
              {skill}
            </span>
          ))}
          {candidate.skills.length > 3 && (
            <span className="text-xs text-gray-500">
              +{candidate.skills.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Date */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>
          {new Date(candidate.created_at).toLocaleDateString("ko-KR")}
        </span>
        <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
          상세 보기 →
        </span>
      </div>
    </Link>
  );
}

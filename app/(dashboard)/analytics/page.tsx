"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  Clock,
  Award,
  Loader2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyticsData {
  totalCandidates: number;
  thisMonthCandidates: number;
  avgConfidence: number;
  highConfidenceCount: number;
  totalExports: number;
  skillDistribution: { skill: string; count: number }[];
  expDistribution: { range: string; count: number }[];
  monthlyTrend: { month: string; count: number }[];
}

interface CandidateRow {
  id: string;
  skills: string[] | null;
  exp_years: number | null;
  confidence_score: number | null;
  created_at: string;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Fetch candidates
      const { data: candidates, error } = await supabase
        .from("candidates")
        .select("id, skills, exp_years, confidence_score, created_at")
        .eq("status", "completed")
        .eq("is_latest", true) as { data: CandidateRow[] | null; error: Error | null };

      if (error) throw error;

      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();

      // Calculate analytics
      const totalCandidates = candidates?.length || 0;
      const thisMonthCandidates = candidates?.filter((c) => {
        const date = new Date(c.created_at);
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
      }).length || 0;

      const avgConfidence = candidates?.length
        ? candidates.reduce((sum, c) => sum + (c.confidence_score || 0), 0) / candidates.length
        : 0;

      const highConfidenceCount = candidates?.filter(
        (c) => (c.confidence_score || 0) >= 0.95
      ).length || 0;

      // Skill distribution
      const skillMap = new Map<string, number>();
      candidates?.forEach((c) => {
        c.skills?.forEach((skill: string) => {
          skillMap.set(skill, (skillMap.get(skill) || 0) + 1);
        });
      });
      const skillDistribution = Array.from(skillMap.entries())
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Experience distribution
      const expRanges = [
        { range: "0-2년", min: 0, max: 2 },
        { range: "3-5년", min: 3, max: 5 },
        { range: "6-10년", min: 6, max: 10 },
        { range: "10년+", min: 10, max: 100 },
      ];
      const expDistribution = expRanges.map(({ range, min, max }) => ({
        range,
        count: candidates?.filter((c) => {
          const exp = c.exp_years || 0;
          return exp >= min && (max === 100 ? true : exp <= max);
        }).length || 0,
      }));

      // Monthly trend (last 6 months)
      const monthlyTrend: { month: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(thisYear, thisMonth - i, 1);
        const monthStr = date.toLocaleDateString("ko-KR", { month: "short" });
        const count = candidates?.filter((c) => {
          const cDate = new Date(c.created_at);
          return cDate.getMonth() === date.getMonth() && cDate.getFullYear() === date.getFullYear();
        }).length || 0;
        monthlyTrend.push({ month: monthStr, count });
      }

      // Fetch exports
      const { count: exportCount } = await supabase
        .from("blind_exports")
        .select("id", { count: "exact", head: true });

      setData({
        totalCandidates,
        thisMonthCandidates,
        avgConfidence,
        highConfidenceCount,
        totalExports: exportCount || 0,
        skillDistribution,
        expDistribution,
        monthlyTrend,
      });
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-slate-400">
        데이터를 불러올 수 없습니다
      </div>
    );
  }

  const maxSkillCount = Math.max(...data.skillDistribution.map((s) => s.count), 1);
  const maxExpCount = Math.max(...data.expDistribution.map((e) => e.count), 1);
  const maxTrendCount = Math.max(...data.monthlyTrend.map((t) => t.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <p className="text-slate-400 mt-1">
          후보자 데이터 분석 및 인사이트
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-primary/20">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <ArrowUp className="w-3 h-3" />
              {data.thisMonthCandidates}
            </span>
          </div>
          <p className="text-3xl font-bold text-white mt-4">{data.totalCandidates}</p>
          <p className="text-sm text-slate-400">전체 후보자</p>
        </div>

        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Award className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white mt-4">
            {Math.round(data.avgConfidence * 100)}%
          </p>
          <p className="text-sm text-slate-400">평균 신뢰도</p>
        </div>

        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <TrendingUp className="w-5 h-5 text-yellow-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white mt-4">{data.highConfidenceCount}</p>
          <p className="text-sm text-slate-400">높은 신뢰도 (95%+)</p>
        </div>

        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white mt-4">{data.totalExports}</p>
          <p className="text-sm text-slate-400">블라인드 내보내기</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">월별 등록 추이</h3>
          <div className="flex items-end gap-2 h-48">
            {data.monthlyTrend.map((item, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full bg-primary/30 rounded-t-lg transition-all hover:bg-primary/50"
                  style={{ height: `${(item.count / maxTrendCount) * 100}%`, minHeight: "4px" }}
                />
                <span className="text-xs text-slate-400">{item.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Experience Distribution */}
        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">경력 분포</h3>
          <div className="space-y-3">
            {data.expDistribution.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="w-16 text-sm text-slate-400">{item.range}</span>
                <div className="flex-1 h-8 bg-white/5 rounded-lg overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-lg transition-all"
                    style={{ width: `${(item.count / maxExpCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-sm text-white text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Skills */}
        <div className="p-6 rounded-xl bg-white/5 border border-white/10 col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">상위 스킬</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {data.skillDistribution.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="w-4 text-xs text-slate-500">{index + 1}</span>
                <span className="w-32 text-sm text-slate-300 truncate">{item.skill}</span>
                <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-lg transition-all",
                      index < 3 ? "bg-primary" : "bg-slate-600"
                    )}
                    style={{ width: `${(item.count / maxSkillCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-sm text-white text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

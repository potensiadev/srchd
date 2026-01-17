"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Users,
  FileText,
  Loader2,
  ArrowUp,
  ArrowDown,
  Briefcase,
  Calendar,
  Target,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Phone,
  UserCheck,
  Building2,
  MapPin,
  Sparkles,
  ChevronRight,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalyticsSkeleton } from "@/components/ui/empty-state";
import { type MatchStage, type PositionStatus, type PositionPriority } from "@/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PipelineStage {
  stage: MatchStage;
  label: string;
  count: number;
  color: string;
}

interface PositionHealth {
  id: string;
  title: string;
  clientCompany?: string;
  status: PositionStatus;
  priority: PositionPriority;
  createdAt: string;
  deadline?: string;
  matchCount: number;
  stuckCount: number; // candidates not progressing
  daysOpen: number;
  healthStatus: "critical" | "warning" | "good";
}

interface SkillStat {
  skill: string;
  count: number;
  percentage: number;
}

interface CompanyStat {
  company: string;
  count: number;
  percentage: number;
}

interface LocationStat {
  location: string;
  count: number;
  percentage: number;
}

interface RecentActivity {
  id: string;
  type: "placement" | "upload" | "stage_change" | "position_created";
  description: string;
  timestamp: string;
  metadata?: {
    candidateName?: string;
    positionTitle?: string;
    stage?: MatchStage;
  };
}

interface AnalyticsData {
  // Basic stats
  totalCandidates: number;
  thisMonthCandidates: number;
  lastMonthCandidates: number;
  totalExports: number;

  // Pipeline stats
  pipelineStages: PipelineStage[];
  totalInPipeline: number;

  // KPIs
  placementRate: number;
  placementRateChange: number;
  avgTimeToFill: number; // days
  activePositions: number;
  urgentPositions: number;

  // Position health
  positionHealth: PositionHealth[];

  // Talent pool analytics
  expDistribution: { range: string; count: number; min: number; max: number }[];
  topSkills: SkillStat[];
  topCompanies: CompanyStat[];
  locationDistribution: LocationStat[];

  // Activity
  recentActivities: RecentActivity[];

  // Trends
  monthlyPlacements: { month: string; count: number }[];
  monthlyCandidates: { month: string; count: number }[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STAGE_CONFIG: Record<MatchStage, { label: string; color: string; bgColor: string }> = {
  matched: { label: "매칭됨", color: "text-gray-600", bgColor: "bg-gray-100" },
  reviewed: { label: "검토완료", color: "text-blue-600", bgColor: "bg-blue-100" },
  contacted: { label: "연락함", color: "text-indigo-600", bgColor: "bg-indigo-100" },
  interviewing: { label: "인터뷰중", color: "text-purple-600", bgColor: "bg-purple-100" },
  offered: { label: "오퍼제안", color: "text-amber-600", bgColor: "bg-amber-100" },
  placed: { label: "채용완료", color: "text-emerald-600", bgColor: "bg-emerald-100" },
  rejected: { label: "제외됨", color: "text-red-600", bgColor: "bg-red-100" },
  withdrawn: { label: "철회됨", color: "text-gray-400", bgColor: "bg-gray-50" },
};

const PIPELINE_STAGES: MatchStage[] = ["matched", "reviewed", "contacted", "interviewing", "offered", "placed"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedExpRange, setSelectedExpRange] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

      // Type definitions for Supabase results
      type CandidateRow = {
        id: string;
        exp_years: number | null;
        created_at: string;
        skills: string[] | null;
        careers: { company: string }[] | null;
        address: string | null;
        last_company: string | null;
      };

      type PositionRow = {
        id: string;
        title: string;
        client_company: string | null;
        status: string;
        priority: string;
        created_at: string;
        deadline: string | null;
        position_candidates: { id: string; stage: string; stage_updated_at: string }[] | null;
      };

      type PipelineRow = {
        stage: string;
        matched_at: string;
        stage_updated_at: string;
      };

      type ActivityRow = {
        id: string;
        activity_type: string;
        description: string;
        created_at: string;
        metadata: Record<string, unknown> | null;
      };

      // Parallel fetch all data
      const [
        candidatesResult,
        exportsResult,
        positionsResult,
        pipelineResult,
        activitiesResult,
      ] = await Promise.all([
        // Candidates with skills and careers
        supabase
          .from("candidates")
          .select("id, exp_years, created_at, skills, careers, address, last_company")
          .eq("status", "completed")
          .eq("is_latest", true),

        // Blind exports count
        supabase
          .from("blind_exports")
          .select("id", { count: "exact", head: true }),

        // Positions with match counts
        supabase
          .from("positions")
          .select(`
            id, title, client_company, status, priority, created_at, deadline,
            position_candidates(id, stage, stage_updated_at)
          `),

        // All pipeline data for conversion rates
        supabase
          .from("position_candidates")
          .select("stage, matched_at, stage_updated_at"),

        // Recent activities
        supabase
          .from("position_activities")
          .select("id, activity_type, description, created_at, metadata")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const candidates = (candidatesResult.data || []) as CandidateRow[];
      const positions = (positionsResult.data || []) as PositionRow[];
      const pipelineData = (pipelineResult.data || []) as PipelineRow[];
      const activities = (activitiesResult.data || []) as ActivityRow[];

      // Calculate basic stats
      const totalCandidates = candidates.length;
      const thisMonthCandidates = candidates.filter((c) => {
        const date = new Date(c.created_at);
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
      }).length;
      const lastMonthCandidates = candidates.filter((c) => {
        const date = new Date(c.created_at);
        return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
      }).length;

      // Experience distribution
      const expRanges = [
        { range: "신입 (0-2년)", min: 0, max: 2 },
        { range: "주니어 (3-5년)", min: 3, max: 5 },
        { range: "미들 (6-9년)", min: 6, max: 9 },
        { range: "시니어 (10-14년)", min: 10, max: 14 },
        { range: "리드급 (15년+)", min: 15, max: 100 },
      ];
      const expDistribution = expRanges.map(({ range, min, max }) => ({
        range,
        min,
        max,
        count: candidates.filter((c) => {
          const exp = c.exp_years || 0;
          return exp >= min && (max === 100 ? true : exp <= max);
        }).length,
      }));

      // Pipeline stages aggregation
      const stageCounts: Record<string, number> = {};
      for (const match of pipelineData) {
        const stage = match.stage as string;
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      }

      const pipelineStages: PipelineStage[] = PIPELINE_STAGES.map((stage) => ({
        stage,
        label: STAGE_CONFIG[stage].label,
        count: stageCounts[stage] || 0,
        color: STAGE_CONFIG[stage].color,
      }));

      const totalInPipeline = pipelineStages.reduce((sum, s) => sum + s.count, 0);
      const placedCount = stageCounts["placed"] || 0;
      const placementRate = totalInPipeline > 0 ? (placedCount / totalInPipeline) * 100 : 0;

      // Active positions
      const activePositions = positions.filter((p) => p.status === "open").length;
      const urgentPositions = positions.filter((p) => p.status === "open" && p.priority === "urgent").length;

      // Position health calculation
      const positionHealth: PositionHealth[] = positions
        .filter((p) => p.status === "open")
        .map((p) => {
          const matches = (p.position_candidates || []) as { stage: string; stage_updated_at: string }[];
          const matchCount = matches.length;
          const daysOpen = Math.floor((now.getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24));

          // Stuck = in matched/reviewed for > 7 days
          const stuckCount = matches.filter((m) => {
            if (!["matched", "reviewed"].includes(m.stage)) return false;
            const daysSinceUpdate = Math.floor(
              (now.getTime() - new Date(m.stage_updated_at).getTime()) / (1000 * 60 * 60 * 24)
            );
            return daysSinceUpdate > 7;
          }).length;

          // Health status
          let healthStatus: "critical" | "warning" | "good" = "good";
          if (matchCount === 0 && daysOpen > 14) healthStatus = "critical";
          else if (daysOpen > 30 || stuckCount > 3) healthStatus = "warning";
          else if (matchCount === 0 && daysOpen > 7) healthStatus = "warning";

          return {
            id: p.id,
            title: p.title,
            clientCompany: p.client_company ?? undefined,
            status: p.status as PositionStatus,
            priority: p.priority as PositionPriority,
            createdAt: p.created_at,
            deadline: p.deadline ?? undefined,
            matchCount,
            stuckCount,
            daysOpen,
            healthStatus,
          };
        })
        .sort((a, b) => {
          const healthOrder = { critical: 0, warning: 1, good: 2 };
          return healthOrder[a.healthStatus] - healthOrder[b.healthStatus];
        })
        .slice(0, 5);

      // Top skills aggregation
      const skillCounts: Record<string, number> = {};
      for (const c of candidates) {
        const skills = (c.skills as string[]) || [];
        for (const skill of skills) {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        }
      }
      const topSkills: SkillStat[] = Object.entries(skillCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([skill, count]) => ({
          skill,
          count,
          percentage: totalCandidates > 0 ? (count / totalCandidates) * 100 : 0,
        }));

      // Top companies aggregation
      const companyCounts: Record<string, number> = {};
      for (const c of candidates) {
        const careers = (c.careers as { company: string }[]) || [];
        for (const career of careers) {
          if (career.company) {
            companyCounts[career.company] = (companyCounts[career.company] || 0) + 1;
          }
        }
      }
      const topCompanies: CompanyStat[] = Object.entries(companyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([company, count]) => ({
          company,
          count,
          percentage: totalCandidates > 0 ? (count / totalCandidates) * 100 : 0,
        }));

      // Location distribution
      const locationCounts: Record<string, number> = {};
      for (const c of candidates) {
        const address = c.address as string | undefined;
        if (address) {
          // Extract city from address (first part before space or comma)
          const city = address.split(/[\s,]/)[0] || "기타";
          locationCounts[city] = (locationCounts[city] || 0) + 1;
        }
      }
      const locationDistribution: LocationStat[] = Object.entries(locationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([location, count]) => ({
          location,
          count,
          percentage: totalCandidates > 0 ? (count / totalCandidates) * 100 : 0,
        }));

      // Recent activities
      const recentActivities: RecentActivity[] = activities.map((a) => {
        let type: RecentActivity["type"] = "stage_change";
        if (a.activity_type === "position_created") type = "position_created";

        return {
          id: a.id,
          type,
          description: a.description,
          timestamp: a.created_at,
          metadata: a.metadata as RecentActivity["metadata"],
        };
      });

      // Monthly trends (last 6 months)
      const monthlyPlacements: { month: string; count: number }[] = [];
      const monthlyCandidates: { month: string; count: number }[] = [];

      for (let i = 5; i >= 0; i--) {
        const date = new Date(thisYear, thisMonth - i, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = `${date.getMonth() + 1}월`;

        const monthCandidates = candidates.filter((c) => {
          const cDate = new Date(c.created_at);
          return cDate.getMonth() === date.getMonth() && cDate.getFullYear() === date.getFullYear();
        }).length;

        monthlyCandidates.push({ month: monthLabel, count: monthCandidates });

        // For placements, we'd need historical data - using estimate for now
        const monthPlacements = pipelineData.filter((p) => {
          if (p.stage !== "placed") return false;
          const pDate = new Date(p.stage_updated_at);
          return pDate.getMonth() === date.getMonth() && pDate.getFullYear() === date.getFullYear();
        }).length;

        monthlyPlacements.push({ month: monthLabel, count: monthPlacements });
      }

      setData({
        totalCandidates,
        thisMonthCandidates,
        lastMonthCandidates,
        totalExports: exportsResult.count || 0,
        pipelineStages,
        totalInPipeline,
        placementRate,
        placementRateChange: lastMonthCandidates > 0
          ? ((thisMonthCandidates - lastMonthCandidates) / lastMonthCandidates) * 100
          : 0,
        avgTimeToFill: 23, // Would need historical placement data to calculate
        activePositions,
        urgentPositions,
        positionHealth,
        expDistribution,
        topSkills,
        topCompanies,
        locationDistribution,
        recentActivities,
        monthlyPlacements,
        monthlyCandidates,
      });
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Conversion rates calculation
  const conversionRates = useMemo(() => {
    if (!data) return [];
    const rates: { from: string; to: string; rate: number }[] = [];

    for (let i = 0; i < data.pipelineStages.length - 1; i++) {
      const current = data.pipelineStages[i];
      const next = data.pipelineStages[i + 1];
      const cumulativeFromCurrent = data.pipelineStages
        .slice(i)
        .reduce((sum, s) => sum + s.count, 0);
      const cumulativeFromNext = data.pipelineStages
        .slice(i + 1)
        .reduce((sum, s) => sum + s.count, 0);

      const rate = cumulativeFromCurrent > 0
        ? (cumulativeFromNext / cumulativeFromCurrent) * 100
        : 0;

      rates.push({
        from: current.label,
        to: next.label,
        rate,
      });
    }

    return rates;
  }, [data]);

  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-gray-400">
        데이터를 불러올 수 없습니다
      </div>
    );
  }

  const maxExpCount = Math.max(...data.expDistribution.map((e) => e.count), 1);
  const totalInDistribution = data.expDistribution.reduce((sum, e) => sum + e.count, 0);
  const maxSkillCount = Math.max(...data.topSkills.map((s) => s.count), 1);
  const maxCompanyCount = Math.max(...data.topCompanies.map((c) => c.count), 1);

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 mt-1">
          채용 파이프라인과 인재풀 현황을 한눈에 확인하세요
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Section 1: Pipeline Funnel */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">채용 파이프라인</h3>
            <p className="text-sm text-gray-500 mt-0.5">전체 포지션의 후보자 진행 현황</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50">
            <Target className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">총 {data.totalInPipeline.toLocaleString()}명</span>
          </div>
        </div>

        {/* Funnel Visualization */}
        <div className="relative">
          <div className="flex items-end justify-between gap-2">
            {data.pipelineStages.map((stage, index) => {
              const heightPercent = data.totalInPipeline > 0
                ? Math.max(20, (stage.count / data.totalInPipeline) * 100)
                : 20;
              const config = STAGE_CONFIG[stage.stage];

              return (
                <div key={stage.stage} className="flex-1 flex flex-col items-center">
                  {/* Count */}
                  <span className="text-2xl font-bold text-gray-900 mb-2">
                    {stage.count}
                  </span>

                  {/* Bar */}
                  <div
                    className={cn(
                      "w-full rounded-t-lg transition-all duration-500",
                      config.bgColor
                    )}
                    style={{ height: `${heightPercent}px`, minHeight: "40px" }}
                  />

                  {/* Label */}
                  <span className={cn("text-xs font-medium mt-2", config.color)}>
                    {stage.label}
                  </span>

                  {/* Conversion Rate Arrow */}
                  {index < conversionRates.length && (
                    <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${((index + 1) / data.pipelineStages.length) * 100}% - 20px)` }}>
                      <div className="flex items-center text-xs text-gray-400">
                        <ChevronRight className="w-4 h-4" />
                        <span className="font-medium">{conversionRates[index].rate.toFixed(0)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Conversion Summary */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">전체 전환율 (매칭 → 채용완료)</span>
            <span className="font-semibold text-emerald-600">
              {data.placementRate.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Section 2: KPI Cards */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Placement Rate */}
        <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-emerald-50">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            {data.placementRateChange !== 0 && (
              <span className={cn(
                "flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium",
                data.placementRateChange > 0
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-red-50 text-red-600"
              )}>
                {data.placementRateChange > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {Math.abs(data.placementRateChange).toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-3xl font-bold text-gray-900">{data.placementRate.toFixed(1)}%</p>
          <p className="text-sm text-gray-500 mt-1">채용 성공률</p>
        </div>

        {/* Active Positions */}
        <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-blue-50">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            {data.urgentPositions > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-xs font-medium text-red-600">
                <AlertTriangle className="w-3 h-3" />
                {data.urgentPositions} 긴급
              </span>
            )}
          </div>
          <p className="text-3xl font-bold text-gray-900">{data.activePositions}</p>
          <p className="text-sm text-gray-500 mt-1">진행중인 포지션</p>
        </div>

        {/* Total Candidates */}
        <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            {data.thisMonthCandidates > 0 && (
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-xs font-medium text-emerald-600">
                <ArrowUp className="w-3 h-3" />
                +{data.thisMonthCandidates}
              </span>
            )}
          </div>
          <p className="text-3xl font-bold text-gray-900">{data.totalCandidates.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">등록된 후보자</p>
        </div>

        {/* Blind Exports */}
        <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-violet-50">
              <FileText className="w-5 h-5 text-violet-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{data.totalExports.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">블라인드 내보내기</p>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Section 3: Position Health & Recent Activity */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Position Health Dashboard */}
        <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">포지션 현황</h3>
              <p className="text-sm text-gray-500 mt-0.5">주의가 필요한 포지션</p>
            </div>
          </div>

          {data.positionHealth.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <CheckCircle2 className="w-10 h-10 mb-2 text-emerald-400" />
              <p className="text-sm">모든 포지션이 정상입니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.positionHealth.map((position) => (
                <div
                  key={position.id}
                  className={cn(
                    "p-3 rounded-xl border transition-colors",
                    position.healthStatus === "critical"
                      ? "border-red-200 bg-red-50/50"
                      : position.healthStatus === "warning"
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-gray-100 bg-gray-50/50"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {position.healthStatus === "critical" && (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                        {position.healthStatus === "warning" && (
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                        )}
                        {position.healthStatus === "good" && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        )}
                        <span className="font-medium text-gray-900 truncate">
                          {position.title}
                        </span>
                      </div>
                      {position.clientCompany && (
                        <p className="text-xs text-gray-500 mt-0.5 ml-4">
                          {position.clientCompany}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500">{position.daysOpen}일</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full",
                        position.matchCount === 0
                          ? "bg-gray-100 text-gray-600"
                          : "bg-blue-100 text-blue-600"
                      )}>
                        {position.matchCount}명
                      </span>
                    </div>
                  </div>
                  {position.stuckCount > 0 && (
                    <p className="text-xs text-amber-600 mt-2 ml-4">
                      {position.stuckCount}명이 7일 이상 정체 중
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">최근 활동</h3>
              <p className="text-sm text-gray-500 mt-0.5">채용 활동 타임라인</p>
            </div>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>

          {data.recentActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Activity className="w-10 h-10 mb-2" />
              <p className="text-sm">아직 활동 기록이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentActivities.map((activity, index) => (
                <div key={activity.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      activity.type === "placement" ? "bg-emerald-100" :
                      activity.type === "upload" ? "bg-blue-100" :
                      activity.type === "position_created" ? "bg-purple-100" :
                      "bg-gray-100"
                    )}>
                      {activity.type === "placement" && <UserCheck className="w-4 h-4 text-emerald-600" />}
                      {activity.type === "upload" && <Users className="w-4 h-4 text-blue-600" />}
                      {activity.type === "position_created" && <Briefcase className="w-4 h-4 text-purple-600" />}
                      {activity.type === "stage_change" && <TrendingUp className="w-4 h-4 text-gray-600" />}
                    </div>
                    {index < data.recentActivities.length - 1 && (
                      <div className="w-px h-full bg-gray-200 my-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm text-gray-900">{activity.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatTimeAgo(activity.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Section 4: Talent Pool Analytics */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Skills */}
        <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">보유 스킬 TOP 10</h3>
              <p className="text-sm text-gray-500 mt-0.5">인재풀 내 스킬 분포</p>
            </div>
            <Sparkles className="w-5 h-5 text-gray-400" />
          </div>

          {data.topSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Sparkles className="w-10 h-10 mb-2" />
              <p className="text-sm">스킬 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.topSkills.map((skill, index) => (
                <div key={skill.skill} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-xs font-medium text-gray-600 flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-700">{skill.skill}</span>
                    </div>
                    <span className="text-sm text-gray-500">{skill.count}명</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden ml-7">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all duration-500 group-hover:from-primary group-hover:to-primary"
                      style={{ width: `${(skill.count / maxSkillCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Companies */}
        <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">출신 회사 TOP 8</h3>
              <p className="text-sm text-gray-500 mt-0.5">후보자 경력 출처</p>
            </div>
            <Building2 className="w-5 h-5 text-gray-400" />
          </div>

          {data.topCompanies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Building2 className="w-10 h-10 mb-2" />
              <p className="text-sm">회사 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.topCompanies.map((company, index) => (
                <div key={company.company} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-xs font-medium text-gray-600 flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
                        {company.company}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">{company.count}명</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden ml-7">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full transition-all duration-500 group-hover:from-indigo-500 group-hover:to-indigo-500"
                      style={{ width: `${(company.count / maxCompanyCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Section 5: Experience & Location Distribution */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Experience Distribution */}
        <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">경력 분포</h3>
              <p className="text-sm text-gray-500 mt-0.5">등록된 후보자의 총 경력 기준</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50">
              <Briefcase className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">총 {totalInDistribution}명</span>
            </div>
          </div>

          <div className="space-y-4">
            {data.expDistribution.map((item, index) => {
              const percentage = totalInDistribution > 0
                ? Math.round((item.count / totalInDistribution) * 100)
                : 0;
              const isSelected = selectedExpRange === item.range;

              return (
                <div
                  key={index}
                  className={cn(
                    "group cursor-pointer rounded-lg p-2 -mx-2 transition-colors",
                    isSelected ? "bg-primary/5" : "hover:bg-gray-50"
                  )}
                  onClick={() => setSelectedExpRange(isSelected ? null : item.range)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      "text-sm font-medium",
                      isSelected ? "text-primary" : "text-gray-700"
                    )}>
                      {item.range}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{percentage}%</span>
                      <span className={cn(
                        "text-sm font-semibold",
                        isSelected ? "text-primary" : "text-gray-900"
                      )}>
                        {item.count}명
                      </span>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isSelected
                          ? "bg-primary"
                          : "bg-gradient-to-r from-primary to-blue-400 group-hover:from-primary group-hover:to-primary"
                      )}
                      style={{ width: `${(item.count / maxExpCount) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Location Distribution */}
        <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">지역 분포</h3>
              <p className="text-sm text-gray-500 mt-0.5">후보자 거주 지역</p>
            </div>
            <MapPin className="w-5 h-5 text-gray-400" />
          </div>

          {data.locationDistribution.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <MapPin className="w-10 h-10 mb-2" />
              <p className="text-sm">지역 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {data.locationDistribution.map((loc, index) => {
                const colors = [
                  "bg-blue-500",
                  "bg-emerald-500",
                  "bg-purple-500",
                  "bg-amber-500",
                  "bg-pink-500",
                  "bg-cyan-500",
                ];
                const bgColors = [
                  "bg-blue-50",
                  "bg-emerald-50",
                  "bg-purple-50",
                  "bg-amber-50",
                  "bg-pink-50",
                  "bg-cyan-50",
                ];
                const textColors = [
                  "text-blue-700",
                  "text-emerald-700",
                  "text-purple-700",
                  "text-amber-700",
                  "text-pink-700",
                  "text-cyan-700",
                ];

                return (
                  <div
                    key={loc.location}
                    className={cn(
                      "p-4 rounded-xl",
                      bgColors[index % bgColors.length]
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("w-2 h-2 rounded-full", colors[index % colors.length])} />
                      <span className={cn("font-medium", textColors[index % textColors.length])}>
                        {loc.location}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-gray-900">{loc.count}</span>
                      <span className="text-sm text-gray-500">명</span>
                    </div>
                    <span className="text-xs text-gray-500">{loc.percentage.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Section 6: Monthly Trends */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">월별 추이</h3>
            <p className="text-sm text-gray-500 mt-0.5">최근 6개월 신규 등록 현황</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-xs text-gray-600">신규 후보자</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs text-gray-600">채용 완료</span>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 h-40">
          {data.monthlyCandidates.map((month, index) => {
            const maxCandidates = Math.max(...data.monthlyCandidates.map((m) => m.count), 1);
            const maxPlacements = Math.max(...data.monthlyPlacements.map((m) => m.count), 1);
            const candidateHeight = (month.count / maxCandidates) * 100;
            const placementHeight = (data.monthlyPlacements[index]?.count || 0) / maxPlacements * 100;

            return (
              <div key={month.month} className="flex-1 flex flex-col items-center gap-2">
                <div className="flex-1 w-full flex items-end justify-center gap-1">
                  {/* Candidates bar */}
                  <div
                    className="w-5 bg-primary/80 rounded-t transition-all duration-500 hover:bg-primary"
                    style={{ height: `${Math.max(candidateHeight, 4)}%` }}
                    title={`${month.count}명`}
                  />
                  {/* Placements bar */}
                  <div
                    className="w-5 bg-emerald-500/80 rounded-t transition-all duration-500 hover:bg-emerald-500"
                    style={{ height: `${Math.max(placementHeight, 4)}%` }}
                    title={`${data.monthlyPlacements[index]?.count || 0}명`}
                  />
                </div>
                <span className="text-xs text-gray-500">{month.month}</span>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">이번 달 신규 등록</p>
            <p className="text-xl font-bold text-gray-900">{data.thisMonthCandidates}명</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">전월 대비</p>
            <p className={cn(
              "text-xl font-bold",
              data.thisMonthCandidates >= data.lastMonthCandidates ? "text-emerald-600" : "text-red-600"
            )}>
              {data.thisMonthCandidates >= data.lastMonthCandidates ? "+" : ""}
              {data.thisMonthCandidates - data.lastMonthCandidates}명
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

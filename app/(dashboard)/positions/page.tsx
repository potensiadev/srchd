"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Filter,
  Briefcase,
  Loader2,
  Plus,
  Users,
  Clock,
  AlertCircle,
  CheckCircle2,
  PauseCircle,
  Calendar,
  Building2,
  Target,
  ChevronDown,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, CardSkeleton } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PositionStatus, PositionPriority } from "@/types/position";

interface Position {
  id: string;
  title: string;
  client_company: string | null;
  department: string | null;
  required_skills: string[];
  min_exp_years: number;
  max_exp_years: number | null;
  status: PositionStatus;
  priority: PositionPriority;
  deadline: string | null;
  created_at: string;
  match_count?: number;
}

const STATUS_CONFIG: Record<PositionStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  open: { label: "진행중", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  paused: { label: "일시중지", icon: PauseCircle, color: "text-amber-600 bg-amber-50 border-amber-200" },
  closed: { label: "마감", icon: AlertCircle, color: "text-gray-500 bg-gray-100 border-gray-200" },
  filled: { label: "채용완료", icon: CheckCircle2, color: "text-blue-600 bg-blue-50 border-blue-200" },
};

const PRIORITY_CONFIG: Record<PositionPriority, { label: string; color: string }> = {
  urgent: { label: "긴급", color: "text-red-600 bg-red-50" },
  high: { label: "높음", color: "text-orange-600 bg-orange-50" },
  normal: { label: "보통", color: "text-gray-500 bg-gray-100" },
  low: { label: "낮음", color: "text-gray-400 bg-gray-50" },
};

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [filteredPositions, setFilteredPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PositionStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"recent" | "deadline" | "priority">("recent");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    positionId: string;
    positionTitle: string;
    newStatus: PositionStatus;
  } | null>(null);

  const supabase = createClient();
  const toast = useToast();

  // positions 조회 함수
  const fetchPositions = async (userId: string) => {
    const { data, error } = await supabase
      .from("positions")
      .select("id, title, client_company, department, required_skills, min_exp_years, max_exp_years, status, priority, deadline, created_at, position_candidates(count)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Positions] Query error:", error);
      throw error;
    }

    // match_count 추가
    return (data || []).map((p: Record<string, unknown>) => ({
      ...p,
      match_count: ((p.position_candidates as { count: number }[])?.[0]?.count) || 0,
    })) as Position[];
  };

  // 페이지 로드 시 사용자 ID 가져오고 positions 조회
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        const data = await fetchPositions(user.id);
        setPositions(data);
      } catch (error) {
        console.error("[Positions] Failed to load:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // 필터링 및 정렬
  useEffect(() => {
    let result = [...positions];

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title?.toLowerCase().includes(query) ||
          p.client_company?.toLowerCase().includes(query) ||
          p.required_skills?.some((s) => s.toLowerCase().includes(query))
      );
    }

    // Sort
    switch (sortBy) {
      case "deadline":
        result.sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        });
        break;
      case "priority":
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        result.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        break;
      default:
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    setFilteredPositions(result);
  }, [positions, searchQuery, statusFilter, sortBy]);

  // 통계 계산
  const stats = {
    total: positions.length,
    open: positions.filter((p) => p.status === "open").length,
    urgent: positions.filter((p) => p.priority === "urgent" && p.status === "open").length,
    deadlineSoon: positions.filter((p) => {
      if (!p.deadline || p.status !== "open") return false;
      const daysLeft = Math.ceil((new Date(p.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 7;
    }).length,
    closed: positions.filter((p) => p.status === "closed").length,
  };

  // 상태 변경 확인 다이얼로그 열기
  const openStatusConfirm = (position: Position, newStatus: PositionStatus) => {
    setOpenDropdownId(null);
    setConfirmDialog({
      open: true,
      positionId: position.id,
      positionTitle: position.title,
      newStatus,
    });
  };

  // 상태 변경 함수
  const handleStatusChange = async () => {
    if (!confirmDialog) return;

    const { positionId, newStatus } = confirmDialog;
    setConfirmDialog(null);
    setUpdatingStatusId(positionId);

    try {
      const response = await fetch(`/api/positions/${positionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error("상태 변경에 실패했습니다.");
      }

      // 로컬 상태 업데이트
      setPositions((prev) =>
        prev.map((p) => (p.id === positionId ? { ...p, status: newStatus } : p))
      );

      toast.success("상태 변경", `포지션 상태가 "${STATUS_CONFIG[newStatus].label}"으로 변경되었습니다.`);
    } catch (error) {
      console.error("Status update error:", error);
      toast.error("오류", "상태 변경에 실패했습니다.");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    if (openDropdownId) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openDropdownId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Positions</h1>
          <p className="text-gray-500 mt-1">
            채용 포지션을 관리하고 후보자를 매칭하세요
          </p>
        </div>
        <Link
          href="/positions/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90
                   text-white font-medium transition-all shadow-sm active:scale-95"
        >
          <Plus className="w-5 h-5" />
          새 포지션
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Briefcase className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">전체 포지션</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Target className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.open}</p>
              <p className="text-sm text-gray-500">진행중</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.urgent}</p>
              <p className="text-sm text-gray-500">긴급</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.deadlineSoon}</p>
              <p className="text-sm text-gray-500">7일 내 마감</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-500/10">
              <XCircle className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.closed}</p>
              <p className="text-sm text-gray-500">마감</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="포지션명, 회사명, 스킬로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-gray-200
                     text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-700
                     focus:outline-none focus:border-primary/50 cursor-pointer"
          >
            <option value="all">전체 상태</option>
            <option value="open">진행중</option>
            <option value="paused">일시중지</option>
            <option value="closed">마감</option>
            <option value="filled">채용완료</option>
          </select>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-700
                       focus:outline-none focus:border-primary/50 cursor-pointer"
            >
              <option value="recent">최근 등록순</option>
              <option value="deadline">마감일순</option>
              <option value="priority">우선순위순</option>
            </select>
          </div>
        </div>
      </div>

      {/* Position Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardSkeleton count={6} />
        </div>
      ) : filteredPositions.length === 0 ? (
        <EmptyState
          variant={searchQuery || statusFilter !== "all" ? "search-results" : "positions"}
          title={searchQuery || statusFilter !== "all" ? "검색 결과가 없습니다" : undefined}
          description={searchQuery || statusFilter !== "all"
            ? "다른 조건으로 검색해보세요."
            : undefined}
          cta={!searchQuery && statusFilter === "all" ? {
            label: "첫 포지션 등록하기",
            href: "/positions/new",
          } : statusFilter !== "all" ? {
            label: "전체 보기",
            onClick: () => setStatusFilter("all"),
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPositions.map((position) => {
            const statusConfig = STATUS_CONFIG[position.status];
            const priorityConfig = PRIORITY_CONFIG[position.priority];
            const StatusIcon = statusConfig.icon;

            // 마감일 계산
            let deadlineText = "";
            let deadlineUrgent = false;
            if (position.deadline) {
              const daysLeft = Math.ceil(
                (new Date(position.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );
              if (daysLeft < 0) {
                deadlineText = "마감됨";
              } else if (daysLeft === 0) {
                deadlineText = "오늘 마감";
                deadlineUrgent = true;
              } else if (daysLeft <= 7) {
                deadlineText = `D-${daysLeft}`;
                deadlineUrgent = true;
              } else {
                deadlineText = new Date(position.deadline).toLocaleDateString("ko-KR");
              }
            }

            const isDropdownOpen = openDropdownId === position.id;
            const isUpdating = updatingStatusId === position.id;

            return (
              <div
                key={position.id}
                className="group relative p-5 rounded-xl bg-white
                         border border-gray-200 hover:border-primary/40
                         transition-all duration-200 hover:shadow-md
                         hover:-translate-y-0.5"
              >
                {/* Status Dropdown - Top Right */}
                <div className="absolute top-4 right-4 z-10">
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenDropdownId(isDropdownOpen ? null : position.id);
                      }}
                      disabled={isUpdating}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                        statusConfig.color,
                        "hover:opacity-80",
                        isUpdating && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isUpdating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <StatusIcon className="w-3 h-3" />
                      )}
                      {statusConfig.label}
                      <ChevronDown className={cn("w-3 h-3 transition-transform", isDropdownOpen && "rotate-180")} />
                    </button>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                      <div
                        className="absolute right-0 top-full mt-1 w-32 py-1 bg-white rounded-lg border border-gray-200 shadow-lg z-20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(Object.keys(STATUS_CONFIG) as PositionStatus[]).map((status) => {
                          const config = STATUS_CONFIG[status];
                          const Icon = config.icon;
                          const isActive = position.status === status;
                          return (
                            <button
                              key={status}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!isActive) {
                                  openStatusConfirm(position, status);
                                }
                              }}
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
                                isActive
                                  ? "bg-gray-50 text-gray-900"
                                  : "text-gray-600 hover:bg-gray-50"
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {config.label}
                              {isActive && <CheckCircle2 className="w-3 h-3 ml-auto text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Clickable Area for Navigation */}
                <Link
                  href={`/positions/${position.id}`}
                  className="block"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-3 pr-24">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors truncate">
                        {position.title}
                      </h3>
                      {position.client_company && (
                        <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
                          <Building2 className="w-3.5 h-3.5" />
                          {position.client_company}
                          {position.department && ` / ${position.department}`}
                        </p>
                      )}
                    </div>
                    {/* Priority Badge */}
                    {position.priority !== "normal" && (
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                        priorityConfig.color
                      )}>
                        {priorityConfig.label}
                      </span>
                    )}
                  </div>

                  {/* Experience */}
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                    <span>
                      {!position.min_exp_years && !position.max_exp_years
                        ? "경력무관"
                        : position.max_exp_years
                          ? `경력 ${position.min_exp_years}년 ~ ${position.max_exp_years}년`
                          : `경력 ${position.min_exp_years}년 이상`}
                    </span>
                  </div>

                  {/* Skills */}
                  {position.required_skills && position.required_skills.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-4">
                      {position.required_skills.slice(0, 4).map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-600"
                        >
                          {skill}
                        </span>
                      ))}
                      {position.required_skills.length > 4 && (
                        <span className="text-xs text-gray-400">
                          +{position.required_skills.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                    {/* Deadline */}
                    <div className="flex items-center gap-3">
                      {deadlineText && (
                        <span className={cn(
                          "flex items-center gap-1 text-xs",
                          deadlineUrgent ? "text-orange-500" : deadlineText === "마감됨" ? "text-red-500" : "text-gray-400"
                        )}>
                          <Calendar className="w-3 h-3" />
                          {deadlineText}
                        </span>
                      )}
                    </div>

                    {/* Match Count */}
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Users className="w-3.5 h-3.5" />
                      <span>{position.match_count || 0}명 매칭</span>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Status Change Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => !open && setConfirmDialog(null)}
          title="상태 변경"
          description={`"${confirmDialog.positionTitle}" 포지션의 상태를 "${STATUS_CONFIG[confirmDialog.newStatus].label}"으로 변경하시겠습니까?`}
          confirmLabel="변경"
          cancelLabel="취소"
          variant="warning"
          onConfirm={handleStatusChange}
        />
      )}
    </div>
  );
}

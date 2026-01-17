"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bookmark,
  BookmarkPlus,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  Clock,
  Search,
  Loader2,
} from "lucide-react";
import type { SearchFilters } from "@/types";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteConfirmDialog } from "@/components/ui/confirm-dialog";

interface SavedSearch {
  id: string;
  name: string;
  query: string | null;
  filters: SearchFilters;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

interface SavedSearchesProps {
  currentQuery: string;
  currentFilters: SearchFilters;
  onLoadSearch: (query: string, filters: SearchFilters) => void;
}

export default function SavedSearches({
  currentQuery,
  currentFilters,
  onLoadSearch,
}: SavedSearchesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newSearchName, setNewSearchName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedSearch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const toast = useToast();

  // 저장된 검색 목록 조회
  const fetchSavedSearches = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/saved-searches");
      if (response.ok) {
        const data = await response.json();
        setSavedSearches(data.data?.savedSearches || []);
      }
    } catch (err) {
      console.error("Failed to fetch saved searches:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 패널 열릴 때 목록 조회
  useEffect(() => {
    if (isOpen) {
      fetchSavedSearches();
    }
  }, [isOpen, fetchSavedSearches]);

  // 현재 검색 저장
  const handleSaveSearch = async () => {
    if (!newSearchName.trim()) {
      setError("검색 이름을 입력해주세요.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSearchName.trim(),
          query: currentQuery || null,
          filters: currentFilters,
        }),
      });

      if (response.ok) {
        await fetchSavedSearches();
        setShowSaveDialog(false);
        setNewSearchName("");
        toast.success("검색이 저장되었습니다", `"${newSearchName.trim()}" 저장 완료`);
      } else {
        const data = await response.json();
        const errorMsg = data.error?.message || "저장에 실패했습니다.";
        setError(errorMsg);
        toast.error("저장 실패", errorMsg);
      }
    } catch (err) {
      console.error("Failed to save search:", err);
      setError("저장 중 오류가 발생했습니다.");
      toast.error("저장 실패", "네트워크 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  // 저장된 검색 불러오기
  const handleLoadSearch = async (search: SavedSearch) => {
    // 사용 횟수 증가
    try {
      await fetch(`/api/saved-searches/${search.id}/use`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to update use count:", err);
    }

    // 검색 적용
    onLoadSearch(search.query || "", search.filters);
    setIsOpen(false);
    toast.info("검색 적용됨", `"${search.name}" 검색이 적용되었습니다.`);
  };

  // 삭제 다이얼로그 열기
  const openDeleteDialog = (search: SavedSearch, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(search);
  };

  // 저장된 검색 삭제 실행
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    const searchName = deleteTarget.name;
    const searchId = deleteTarget.id;

    try {
      const response = await fetch(`/api/saved-searches/${searchId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSavedSearches((prev) => prev.filter((s) => s.id !== searchId));
        toast.success("검색이 삭제되었습니다", `"${searchName}" 삭제 완료`);
        setDeleteTarget(null);
      } else {
        toast.error("삭제 실패", "검색을 삭제할 수 없습니다.");
      }
    } catch (err) {
      console.error("Failed to delete saved search:", err);
      toast.error("삭제 실패", "네트워크 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  // 필터 요약 텍스트 생성
  const getFilterSummary = (filters: SearchFilters): string => {
    const parts: string[] = [];

    if (filters.skills?.length) {
      parts.push(`스킬: ${filters.skills.slice(0, 3).join(", ")}${filters.skills.length > 3 ? "..." : ""}`);
    }
    if (filters.expYearsMin || filters.expYearsMax) {
      parts.push(
        `경력: ${filters.expYearsMin || 0}-${filters.expYearsMax || "∞"}년`
      );
    }
    if (filters.location) {
      parts.push(`위치: ${filters.location}`);
    }
    if (filters.companies?.length) {
      parts.push(`회사: ${filters.companies[0]}${filters.companies.length > 1 ? ` 외 ${filters.companies.length - 1}` : ""}`);
    }
    if (filters.educationLevel) {
      parts.push(`학력: ${filters.educationLevel}`);
    }

    return parts.join(" | ") || "필터 없음";
  };

  // 현재 검색이 저장 가능한지 확인
  const canSave = currentQuery.trim() || Object.keys(currentFilters).length > 0;

  return (
    <div className="relative">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
          isOpen
            ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
            : "bg-gray-800/50 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
        }`}
      >
        <Bookmark className="w-4 h-4" />
        <span className="text-sm font-medium">Saved</span>
        {savedSearches.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500/20 rounded">
            {savedSearches.length}
          </span>
        )}
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {/* Saved Searches Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="absolute top-full left-0 mt-2 p-4 rounded-xl bg-gray-800/95 backdrop-blur-sm border border-gray-700 z-50 min-w-[400px] max-h-[70vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-amber-400" />
                Saved Searches
              </h3>
              {canSave && (
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  현재 검색 저장
                </button>
              )}
            </div>

            {/* Save Dialog */}
            <AnimatePresence>
              {showSaveDialog && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 p-3 rounded-lg bg-gray-700/50 border border-gray-600"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={newSearchName}
                      onChange={(e) => setNewSearchName(e.target.value)}
                      placeholder="검색 이름 입력"
                      className="flex-1 px-3 py-2 rounded-lg text-sm bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveSearch();
                        if (e.key === "Escape") {
                          setShowSaveDialog(false);
                          setNewSearchName("");
                          setError(null);
                        }
                      }}
                    />
                    <button
                      onClick={handleSaveSearch}
                      disabled={isSaving}
                      className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "저장"
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowSaveDialog(false);
                        setNewSearchName("");
                        setError(null);
                      }}
                      className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {/* 현재 검색 요약 */}
                  <div className="text-xs text-gray-500">
                    {currentQuery && (
                      <div className="flex items-center gap-1">
                        <Search className="w-3 h-3" />
                        <span>{currentQuery}</span>
                      </div>
                    )}
                    {Object.keys(currentFilters).length > 0 && (
                      <div className="mt-1">{getFilterSummary(currentFilters)}</div>
                    )}
                  </div>
                  {error && (
                    <div className="mt-2 text-xs text-red-400">{error}</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Saved Searches List */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : savedSearches.length === 0 ? (
                <EmptyState
                  variant="saved-searches"
                  className="py-8"
                  cta={canSave ? {
                    label: "현재 검색 저장",
                    onClick: () => setShowSaveDialog(true),
                  } : undefined}
                />
              ) : (
                <div className="space-y-2">
                  {savedSearches.map((search) => (
                    <button
                      key={search.id}
                      onClick={() => handleLoadSearch(search)}
                      className="w-full p-3 rounded-lg bg-gray-700/30 hover:bg-gray-700/50 border border-gray-600/50 hover:border-gray-500 text-left transition-colors group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-white truncate">
                            {search.name}
                          </div>
                          {search.query && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                              <Search className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{search.query}</span>
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-1 truncate">
                            {getFilterSummary(search.filters)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {search.useCount}회
                          </div>
                          <button
                            onClick={(e) => openDeleteDialog(search, e)}
                            className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 삭제 확인 다이얼로그 */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        itemName={deleteTarget?.name}
        itemType="저장된 검색"
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}

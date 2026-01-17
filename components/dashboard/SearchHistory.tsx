"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, Clock, X, Trash2, Search as SearchIcon } from "lucide-react";
import { useSearchHistory, type SearchHistoryItem } from "@/lib/hooks/useSearchHistory";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface SearchHistoryProps {
  isVisible: boolean;
  onSelect: (query: string) => void;
  onClose: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function SearchHistory({
  isVisible,
  onSelect,
  onClose,
  inputRef,
}: SearchHistoryProps) {
  const { history, removeSearch, clearHistory } = useSearchHistory();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        inputRef?.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isVisible, onClose, inputRef]);

  // 키보드 네비게이션 (ESC로 닫기)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isVisible) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, onClose]);

  // 항목 클릭
  const handleSelect = (item: SearchHistoryItem) => {
    onSelect(item.query);
    onClose();
  };

  // 항목 삭제
  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeSearch(id);
  };

  // 전체 삭제
  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    clearHistory();
    setShowClearConfirm(false);
  };

  // 상대 시간 포맷
  const formatRelativeTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return new Date(timestamp).toLocaleDateString("ko-KR");
  };

  if (!isVisible || history.length === 0) {
    return (
      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="검색 기록 전체 삭제"
        description="모든 검색 기록을 삭제하시겠습니까?"
        confirmLabel="삭제"
        variant="warning"
        onConfirm={handleConfirmClear}
      />
    );
  }

  return (
    <>
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-gray-800/95 backdrop-blur-sm border border-gray-700 shadow-xl z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <History className="w-4 h-4" />
            최근 검색
          </div>
          <button
            onClick={handleClearAll}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            전체 삭제
          </button>
        </div>

        {/* History List */}
        <div className="max-h-80 overflow-y-auto">
          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <SearchIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="text-sm text-white truncate">{item.query}</span>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(item.timestamp)}
                </span>

                <AnimatePresence>
                  {hoveredId === item.id && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={(e) => handleRemove(e, item.id)}
                      className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/50">
          <p className="text-xs text-gray-500 text-center">
            최근 {history.length}개의 검색 기록
          </p>
        </div>
      </motion.div>
    </AnimatePresence>

    <ConfirmDialog
      open={showClearConfirm}
      onOpenChange={setShowClearConfirm}
      title="검색 기록 전체 삭제"
      description="모든 검색 기록을 삭제하시겠습니까?"
      confirmLabel="삭제"
      variant="warning"
      onConfirm={handleConfirmClear}
    />
    </>
  );
}

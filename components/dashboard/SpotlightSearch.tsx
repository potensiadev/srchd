"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Search, Sparkles, Loader2 } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { MAGNETIC_SPRING } from "@/lib/physics";
import { useSearch } from "@/hooks";
import SearchFilters from "./SearchFilters";
import type { CandidateSearchResult, SearchFilters as FilterType } from "@/types";

interface SpotlightSearchProps {
    query: string;
    onQueryChange: (query: string) => void;
    onSearchResults?: (results: CandidateSearchResult[], isSearching: boolean) => void;
    onSearchModeChange?: (isSearchMode: boolean) => void;
}

export default function SpotlightSearch({
    query,
    onQueryChange,
    onSearchResults,
    onSearchModeChange,
}: SpotlightSearchProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [filters, setFilters] = useState<FilterType>({});
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // React Query mutation
    const searchMutation = useSearch();

    // Semantic Mode trigger (10자 이상)
    const isSemantic = query.length > 10;

    // 검색 실행
    const executeSearch = useCallback(
        async (searchQuery: string, searchFilters?: FilterType) => {
            if (!searchQuery.trim()) {
                onSearchResults?.([], false);
                onSearchModeChange?.(false);
                return;
            }

            onSearchModeChange?.(true);
            onSearchResults?.([], true); // 로딩 시작

            try {
                const response = await searchMutation.mutateAsync({
                    query: searchQuery,
                    filters: searchFilters || filters,
                    limit: 20,
                });
                onSearchResults?.(response.results, false);
            } catch (error) {
                console.error("Search error:", error);
                onSearchResults?.([], false);
            }
        },
        [searchMutation, onSearchResults, onSearchModeChange, filters]
    );

    // 필터 변경 핸들러
    const handleFiltersChange = useCallback(
        (newFilters: FilterType) => {
            setFilters(newFilters);
            if (query.trim()) {
                executeSearch(query, newFilters);
            }
        },
        [query, executeSearch]
    );

    // 디바운스된 검색
    const debouncedSearch = useCallback(
        (searchQuery: string) => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }

            debounceRef.current = setTimeout(() => {
                executeSearch(searchQuery);
            }, 500); // 500ms 디바운스
        },
        [executeSearch]
    );

    // 쿼리 변경 핸들러
    const handleQueryChange = (newQuery: string) => {
        onQueryChange(newQuery);

        if (newQuery.trim()) {
            debouncedSearch(newQuery);
        } else {
            // 쿼리가 비면 검색 모드 해제
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
            onSearchResults?.([], false);
            onSearchModeChange?.(false);
        }
    };

    // Enter 키로 즉시 검색
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && query.trim()) {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
            executeSearch(query);
        }
    };

    // Keyboard shortcut (/) to focus
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "/" && !isFocused) {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === "Escape") {
                inputRef.current?.blur();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFocused]);

    // 클린업
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    return (
        <div className="relative z-50 mb-12">
            {/* Dimmed Backdrop */}
            <AnimatePresence>
                {isFocused && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                        onClick={() => setIsFocused(false)}
                    />
                )}
            </AnimatePresence>

            {/* Search Container */}
            <div className="flex justify-center items-start gap-4">
                {/* Search Bar */}
                <motion.div
                    layout
                    initial={{ width: 600 }}
                    animate={{ width: isFocused ? 700 : 600 }}
                    transition={MAGNETIC_SPRING}
                    className={cn(
                        "relative z-50 h-14 rounded-2xl flex items-center px-5 gap-4 transition-colors",
                        isFocused
                            ? "bg-[#0A0A1B] border border-primary/50 shadow-[0_0_40px_rgba(139,92,246,0.15)]"
                            : "bg-white/5 border border-white/10 hover:border-white/20"
                    )}
                >
                    <motion.div
                        animate={{ scale: isSemantic ? 1.1 : 1, rotate: isSemantic ? 15 : 0 }}
                        className={cn("transition-colors", isSemantic ? "text-ai" : "text-slate-400")}
                    >
                        {searchMutation.isPending ? (
                            <Loader2 size={22} className="animate-spin text-primary" />
                        ) : isSemantic ? (
                            <Sparkles size={22} />
                        ) : (
                            <Search size={22} />
                        )}
                    </motion.div>

                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => handleQueryChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder={
                            isSemantic
                                ? "Semantic Vector Search Active..."
                                : "Search candidates by name, skills, or role..."
                        }
                        className="flex-1 bg-transparent border-none outline-none text-base text-white placeholder:text-slate-500 font-medium"
                    />

                    <div className="flex items-center gap-2">
                        {isSemantic && (
                            <span className="text-xs text-ai bg-ai/10 px-2 py-1 rounded border border-ai/20">
                                AI
                            </span>
                        )}
                        {isFocused ? (
                            <span className="text-xs text-slate-500 bg-white/10 px-2 py-1 rounded">
                                ESC
                            </span>
                        ) : (
                            <span className="text-xs text-slate-500 bg-white/10 px-2 py-1 rounded">
                                /
                            </span>
                        )}
                    </div>
                </motion.div>

                {/* Filters Button */}
                <div className="relative z-50">
                    <SearchFilters
                        filters={filters}
                        onFiltersChange={handleFiltersChange}
                        isOpen={isFiltersOpen}
                        onToggle={() => setIsFiltersOpen(!isFiltersOpen)}
                    />
                </div>
            </div>
        </div>
    );
}

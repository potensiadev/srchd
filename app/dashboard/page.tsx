"use client";

import { useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import SpotlightSearch from "@/components/dashboard/SpotlightSearch";
import GravityGrid from "@/components/dashboard/GravityGrid";
import type { CandidateSearchResult } from "@/types";

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<CandidateSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchResults = (results: CandidateSearchResult[], searching: boolean) => {
    setSearchResults(results);
    setIsSearching(searching);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Candidate Assets</h1>
          <p className="text-slate-400 mt-1">
            AI가 분석한 후보자 자산을 검색하고 관리하세요
          </p>
        </div>
        <Link
          href="/upload"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                   bg-primary hover:bg-primary/90 text-white font-medium
                   transition-colors shadow-lg shadow-primary/25"
        >
          <Upload size={18} />
          이력서 업로드
        </Link>
      </div>

      {/* Search */}
      <SpotlightSearch
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onSearchResults={handleSearchResults}
        onSearchModeChange={setIsSearchMode}
      />

      {/* Grid */}
      <GravityGrid
        isSearchMode={isSearchMode}
        searchResults={searchResults}
        isSearching={isSearching}
        searchQuery={searchQuery}
      />
    </div>
  );
}

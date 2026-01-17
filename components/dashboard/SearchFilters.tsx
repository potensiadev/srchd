"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Filter,
  X,
  Briefcase,
  MapPin,
  Code,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { SearchFilters as FilterType, SearchFacets } from "@/types";

interface SearchFiltersProps {
  filters: FilterType;
  onFiltersChange: (filters: FilterType) => void;
  isOpen: boolean;
  onToggle: () => void;
  facets?: SearchFacets; // 선택적 facets - 제공되면 count 표시
}

// 일반적인 스킬 목록
const COMMON_SKILLS = [
  "Python",
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Java",
  "Kotlin",
  "Swift",
  "Go",
  "Rust",
  "AWS",
  "Docker",
  "Kubernetes",
  "PostgreSQL",
  "MongoDB",
];

// 한국 주요 도시
const LOCATIONS = [
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "대전",
  "광주",
  "울산",
  "세종",
  "제주",
];

export default function SearchFilters({
  filters,
  onFiltersChange,
  isOpen,
  onToggle,
  facets,
}: SearchFiltersProps) {
  const [localFilters, setLocalFilters] = useState<FilterType>(filters);

  // facets에서 스킬 count 가져오기
  const getSkillCount = (skill: string): number | undefined => {
    if (!facets) return undefined;
    const found = facets.skills.find(
      (s) => s.value.toLowerCase() === skill.toLowerCase()
    );
    return found?.count;
  };

  // facets에서 지역 count 가져오기
  const getLocationCount = (location: string): number | undefined => {
    if (!facets) return undefined;
    const found = facets.locations.find(
      (l) => l.value.includes(location) || location.includes(l.value)
    );
    return found?.count;
  };

  const handleSkillToggle = (skill: string) => {
    const currentSkills = localFilters.skills || [];
    const newSkills = currentSkills.includes(skill)
      ? currentSkills.filter((s) => s !== skill)
      : [...currentSkills, skill];

    const newFilters = { ...localFilters, skills: newSkills };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleExpYearsChange = (min?: number, max?: number) => {
    const newFilters = {
      ...localFilters,
      expYearsMin: min,
      expYearsMax: max,
    };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleLocationChange = (location: string) => {
    const newFilters = {
      ...localFilters,
      location: localFilters.location === location ? undefined : location,
    };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters: FilterType = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  const hasActiveFilters =
    (filters.skills?.length || 0) > 0 ||
    filters.expYearsMin ||
    filters.expYearsMax ||
    filters.location;

  return (
    <div className="relative">
      {/* Filter Toggle Button */}
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
          hasActiveFilters
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-white border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300"
        }`}
      >
        <Filter className="w-4 h-4" />
        <span className="text-sm font-medium">Filters</span>
        {hasActiveFilters && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/20 rounded">
            {(filters.skills?.length || 0) +
              (filters.expYearsMin || filters.expYearsMax ? 1 : 0) +
              (filters.location ? 1 : 0)}
          </span>
        )}
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {/* Filter Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="absolute top-full left-0 right-0 mt-2 p-4 rounded-xl bg-white border border-gray-200 shadow-lg z-50 min-w-[400px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Search Filters</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Clear all
                </button>
              )}
            </div>

            {/* Experience Years */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Experience
                </span>
              </div>
              <div className="flex gap-2">
                {[
                  { label: "0-2년", min: 0, max: 2 },
                  { label: "3-5년", min: 3, max: 5 },
                  { label: "5-10년", min: 5, max: 10 },
                  { label: "10년+", min: 10, max: undefined },
                ].map((range) => (
                  <button
                    key={range.label}
                    onClick={() => handleExpYearsChange(range.min, range.max)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      localFilters.expYearsMin === range.min &&
                      localFilters.expYearsMax === range.max
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "bg-gray-50 text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200"
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LOCATIONS.map((location) => {
                  const count = getLocationCount(location);
                  const isSelected = localFilters.location === location;
                  const isZeroCount = facets && count === 0;
                  const isDisabled = isZeroCount && !isSelected;

                  return (
                    <button
                      key={location}
                      onClick={() => handleLocationChange(location)}
                      disabled={isDisabled}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                        isSelected
                          ? isZeroCount
                            ? "bg-amber-50 text-amber-600 border border-amber-200"
                            : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : isDisabled
                          ? "bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed opacity-50"
                          : "bg-gray-50 text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200"
                      }`}
                    >
                      <span>{location}</span>
                      {count !== undefined && (
                        <span className={`text-[10px] ${isSelected ? "text-emerald-600" : "text-gray-500"}`}>
                          ({count})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Skills */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Code className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Skills
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_SKILLS.map((skill) => {
                  const count = getSkillCount(skill);
                  const isSelected = (localFilters.skills || []).includes(skill);
                  const isZeroCount = facets && count === 0;
                  const isDisabled = isZeroCount && !isSelected;

                  return (
                    <button
                      key={skill}
                      onClick={() => handleSkillToggle(skill)}
                      disabled={isDisabled}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                        isSelected
                          ? isZeroCount
                            ? "bg-amber-50 text-amber-600 border border-amber-200"
                            : "bg-amber-50 text-amber-600 border border-amber-200"
                          : isDisabled
                          ? "bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed opacity-50"
                          : "bg-gray-50 text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200"
                      }`}
                    >
                      <span>{skill}</span>
                      {count !== undefined && (
                        <span className={`text-[10px] ${isSelected ? "text-amber-600" : "text-gray-500"}`}>
                          ({count})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

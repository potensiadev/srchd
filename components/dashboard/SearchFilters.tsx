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
import type { SearchFilters as FilterType } from "@/types";

interface SearchFiltersProps {
  filters: FilterType;
  onFiltersChange: (filters: FilterType) => void;
  isOpen: boolean;
  onToggle: () => void;
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
}: SearchFiltersProps) {
  const [localFilters, setLocalFilters] = useState<FilterType>(filters);

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
            : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
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
            className="absolute top-full left-0 right-0 mt-2 p-4 rounded-xl bg-slate-800/95 backdrop-blur-sm border border-slate-700 z-50 min-w-[400px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Search Filters</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Clear all
                </button>
              )}
            </div>

            {/* Experience Years */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
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
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-slate-700/50 text-slate-400 hover:text-white border border-slate-600"
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
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Location
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LOCATIONS.map((location) => (
                  <button
                    key={location}
                    onClick={() => handleLocationChange(location)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      localFilters.location === location
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-slate-700/50 text-slate-400 hover:text-white border border-slate-600"
                    }`}
                  >
                    {location}
                  </button>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Code className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Skills
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_SKILLS.map((skill) => (
                  <button
                    key={skill}
                    onClick={() => handleSkillToggle(skill)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      (localFilters.skills || []).includes(skill)
                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                        : "bg-slate-700/50 text-slate-400 hover:text-white border border-slate-600"
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

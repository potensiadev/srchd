"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Code,
  Building2,
  Briefcase,
  X,
} from "lucide-react";
import { useState } from "react";
import type { SearchFacets, FacetItem, SearchFilters } from "@/types";

interface FacetPanelProps {
  facets: SearchFacets | undefined;
  filters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
  isVisible: boolean;
}

interface FacetSectionProps {
  title: string;
  icon: React.ReactNode;
  items: FacetItem[];
  selectedItems: string[];
  onItemClick: (value: string) => void;
  maxItems?: number;
}

function FacetSection({
  title,
  icon,
  items,
  selectedItems,
  onItemClick,
  maxItems = 10,
}: FacetSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const displayItems = showAll ? items : items.slice(0, maxItems);
  const hasMore = items.length > maxItems;

  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-sm font-medium text-slate-300 hover:text-white transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
          <span className="text-xs text-slate-500">({items.length})</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 mt-1">
              {displayItems.map((item) => {
                const isSelected = selectedItems.includes(item.value);
                return (
                  <button
                    key={item.value}
                    onClick={() => onItemClick(item.value)}
                    className={`flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                    }`}
                  >
                    <span className="truncate">{item.value}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        isSelected
                          ? "bg-primary/30 text-primary"
                          : "bg-slate-700 text-slate-500"
                      }`}
                    >
                      {item.count}
                    </span>
                  </button>
                );
              })}
              {hasMore && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="w-full px-2 py-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showAll ? "접기" : `+${items.length - maxItems}개 더 보기`}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FacetPanel({
  facets,
  filters,
  onFilterChange,
  isVisible,
}: FacetPanelProps) {
  if (!isVisible || !facets) return null;

  const handleSkillClick = (skill: string) => {
    const currentSkills = filters.skills || [];
    const newSkills = currentSkills.includes(skill)
      ? currentSkills.filter((s) => s !== skill)
      : [...currentSkills, skill];
    onFilterChange({ ...filters, skills: newSkills.length > 0 ? newSkills : undefined });
  };

  const handleCompanyClick = (company: string) => {
    const currentCompanies = filters.companies || [];
    const newCompanies = currentCompanies.includes(company)
      ? currentCompanies.filter((c) => c !== company)
      : [...currentCompanies, company];
    onFilterChange({ ...filters, companies: newCompanies.length > 0 ? newCompanies : undefined });
  };

  const handleExpYearsClick = (range: string) => {
    let min: number | undefined;
    let max: number | undefined;

    switch (range) {
      case "0-3":
        min = 0;
        max = 3;
        break;
      case "3-5":
        min = 3;
        max = 5;
        break;
      case "5-10":
        min = 5;
        max = 10;
        break;
      case "10+":
        min = 10;
        max = undefined;
        break;
    }

    // 같은 범위 클릭 시 해제
    if (filters.expYearsMin === min && filters.expYearsMax === max) {
      onFilterChange({
        ...filters,
        expYearsMin: undefined,
        expYearsMax: undefined,
      });
    } else {
      onFilterChange({
        ...filters,
        expYearsMin: min,
        expYearsMax: max,
      });
    }
  };

  const isExpRangeSelected = (range: string) => {
    switch (range) {
      case "0-3":
        return filters.expYearsMin === 0 && filters.expYearsMax === 3;
      case "3-5":
        return filters.expYearsMin === 3 && filters.expYearsMax === 5;
      case "5-10":
        return filters.expYearsMin === 5 && filters.expYearsMax === 10;
      case "10+":
        return filters.expYearsMin === 10 && filters.expYearsMax === undefined;
      default:
        return false;
    }
  };

  const expYearsItems: { range: string; label: string; count: number }[] = [
    { range: "0-3", label: "0-3년", count: facets.expYears["0-3"] },
    { range: "3-5", label: "3-5년", count: facets.expYears["3-5"] },
    { range: "5-10", label: "5-10년", count: facets.expYears["5-10"] },
    { range: "10+", label: "10년+", count: facets.expYears["10+"] },
  ].filter((item) => item.count > 0);

  const hasActiveFilters =
    (filters.skills?.length || 0) > 0 ||
    (filters.companies?.length || 0) > 0 ||
    filters.expYearsMin !== undefined ||
    filters.expYearsMax !== undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-64 p-4 rounded-xl bg-slate-800/95 backdrop-blur-sm border border-slate-700"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Filter by</h3>
        {hasActiveFilters && (
          <button
            onClick={() =>
              onFilterChange({
                ...filters,
                skills: undefined,
                companies: undefined,
                expYearsMin: undefined,
                expYearsMax: undefined,
              })
            }
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Experience Distribution */}
      {expYearsItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-slate-300">
            <Briefcase className="w-4 h-4 text-slate-500" />
            <span>Experience</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {expYearsItems.map((item) => (
              <button
                key={item.range}
                onClick={() => handleExpYearsClick(item.range)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                  isExpRangeSelected(item.range)
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-slate-700/50 text-slate-400 hover:text-white border border-slate-600"
                }`}
              >
                <span>{item.label}</span>
                <span className="text-slate-500">({item.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Skills Facet */}
      <FacetSection
        title="Skills"
        icon={<Code className="w-4 h-4 text-slate-500" />}
        items={facets.skills}
        selectedItems={filters.skills || []}
        onItemClick={handleSkillClick}
      />

      {/* Companies Facet */}
      <FacetSection
        title="Companies"
        icon={<Building2 className="w-4 h-4 text-slate-500" />}
        items={facets.companies}
        selectedItems={filters.companies || []}
        onItemClick={handleCompanyClick}
      />
    </motion.div>
  );
}

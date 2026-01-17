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

/**
 * FacetSection: 동적 facet 항목 표시
 * - 선택된 항목은 count가 0이어도 표시 유지 (PRD P1)
 * - 0 count 항목은 비활성화 스타일 적용
 */
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

  // 선택된 항목 중 현재 facets에 없는 것들을 추가 (count: 0)
  const selectedNotInFacets = selectedItems.filter(
    (selected) => !items.some((item) => item.value === selected)
  );
  const selectedItemsWithZero: FacetItem[] = selectedNotInFacets.map((value) => ({
    value,
    count: 0,
  }));

  // 선택된 항목을 맨 앞에 배치, 그 다음 나머지 facet 항목
  const mergedItems = [
    // 선택된 항목 (facets에 있는 것)
    ...items.filter((item) => selectedItems.includes(item.value)),
    // 선택된 항목 (facets에 없는 것, count: 0)
    ...selectedItemsWithZero,
    // 선택되지 않은 항목 (count > 0만)
    ...items.filter((item) => !selectedItems.includes(item.value) && item.count > 0),
  ];

  const displayItems = showAll ? mergedItems : mergedItems.slice(0, maxItems);
  const hasMore = mergedItems.length > maxItems;

  // 모든 항목이 없거나, 선택된 것도 없고 count도 모두 0이면 숨김
  if (mergedItems.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
          <span className="text-xs text-gray-500">({mergedItems.length})</span>
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
                const isZeroCount = item.count === 0;
                const isDisabled = isZeroCount && !isSelected;

                return (
                  <button
                    key={item.value}
                    onClick={() => onItemClick(item.value)}
                    disabled={isDisabled}
                    className={`flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : isZeroCount
                        ? "text-gray-400 cursor-not-allowed opacity-50"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    <span className="truncate">{item.value}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        isSelected
                          ? isZeroCount
                            ? "bg-amber-100 text-amber-600"
                            : "bg-primary/20 text-primary"
                          : "bg-gray-100 text-gray-500"
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
                  className="w-full px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showAll ? "접기" : `+${mergedItems.length - maxItems}개 더 보기`}
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

  // 경력 연수 항목 - 선택된 항목은 count가 0이어도 표시 (PRD P1)
  const allExpYearsItems: { range: string; label: string; count: number }[] = [
    { range: "0-3", label: "0-3년", count: facets.expYears["0-3"] },
    { range: "3-5", label: "3-5년", count: facets.expYears["3-5"] },
    { range: "5-10", label: "5-10년", count: facets.expYears["5-10"] },
    { range: "10+", label: "10년+", count: facets.expYears["10+"] },
  ];

  // 선택되었거나 count > 0인 항목만 표시
  const expYearsItems = allExpYearsItems.filter(
    (item) => item.count > 0 || isExpRangeSelected(item.range)
  );

  const hasActiveFilters =
    (filters.skills?.length || 0) > 0 ||
    (filters.companies?.length || 0) > 0 ||
    filters.expYearsMin !== undefined ||
    filters.expYearsMax !== undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-64 p-4 rounded-xl bg-white border border-gray-200 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Filter by</h3>
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
            className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Experience Distribution */}
      {expYearsItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-gray-700">
            <Briefcase className="w-4 h-4 text-gray-400" />
            <span>Experience</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {expYearsItems.map((item) => {
              const isSelected = isExpRangeSelected(item.range);
              const isZeroCount = item.count === 0;
              const isDisabled = isZeroCount && !isSelected;

              return (
                <button
                  key={item.range}
                  onClick={() => handleExpYearsClick(item.range)}
                  disabled={isDisabled}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? isZeroCount
                        ? "bg-amber-50 text-amber-600 border border-amber-200"
                        : "bg-blue-50 text-blue-600 border border-blue-200"
                      : isZeroCount
                      ? "bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed opacity-50"
                      : "bg-gray-50 text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className={isZeroCount && isSelected ? "text-amber-600" : "text-gray-500"}>
                    ({item.count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Skills Facet */}
      <FacetSection
        title="Skills"
        icon={<Code className="w-4 h-4 text-gray-400" />}
        items={facets.skills}
        selectedItems={filters.skills || []}
        onItemClick={handleSkillClick}
      />

      {/* Companies Facet */}
      <FacetSection
        title="Companies"
        icon={<Building2 className="w-4 h-4 text-gray-400" />}
        items={facets.companies}
        selectedItems={filters.companies || []}
        onItemClick={handleCompanyClick}
      />
    </motion.div>
  );
}

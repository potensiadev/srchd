"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Flame,
  ThermometerSun,
  Snowflake,
  HelpCircle,
  Clock,
  AlertTriangle,
  Bell,
  Users,
  RefreshCw,
} from "lucide-react";
import { type CandidateLifecycleStats } from "@/types";

interface LifecycleStatsProps {
  className?: string;
}

export default function LifecycleStats({ className = "" }: LifecycleStatsProps) {
  const [stats, setStats] = useState<CandidateLifecycleStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/candidates/lifecycle");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setStats(json.data);
      setError(null);
    } catch (err) {
      setError("통계를 불러올 수 없습니다");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className={`bg-white rounded-xl border p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className={`bg-white rounded-xl border p-6 ${className}`}>
        <p className="text-sm text-red-500">{error || "데이터를 불러올 수 없습니다"}</p>
      </div>
    );
  }

  const interestData = [
    {
      level: "Hot",
      count: stats.hotCount,
      icon: Flame,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
    },
    {
      level: "Warm",
      count: stats.warmCount,
      icon: ThermometerSun,
      color: "text-orange-500",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
    },
    {
      level: "Cold",
      count: stats.coldCount,
      icon: Snowflake,
      color: "text-blue-500",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
    },
    {
      level: "Unknown",
      count: stats.unknownCount,
      icon: HelpCircle,
      color: "text-gray-400",
      bgColor: "bg-gray-50",
      borderColor: "border-gray-200",
    },
  ];

  const alertData = [
    {
      label: "30일 미접촉",
      count: stats.noContact30Days,
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      label: "90일 미접촉",
      count: stats.noContact90Days,
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
    {
      label: "팔로업 예정",
      count: stats.upcomingFollowups,
      icon: Bell,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
  ];

  return (
    <div className={`bg-white rounded-xl border shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">후보자 현황</h3>
          <span className="text-sm text-gray-500">
            총 {stats.totalCandidates}명
          </span>
        </div>
        <button
          onClick={fetchStats}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Interest Level Distribution */}
      <div className="p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">이직 의향별 분포</p>
        <div className="grid grid-cols-4 gap-3">
          {interestData.map((item, index) => {
            const Icon = item.icon;
            const percentage =
              stats.totalCandidates > 0
                ? Math.round((item.count / stats.totalCandidates) * 100)
                : 0;
            return (
              <motion.div
                key={item.level}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`p-3 rounded-lg border ${item.bgColor} ${item.borderColor}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${item.color}`} />
                  <span className={`text-sm font-medium ${item.color}`}>
                    {item.level}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{item.count}</p>
                <p className="text-xs text-gray-500">{percentage}%</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Alerts */}
      <div className="px-4 pb-4">
        <p className="text-sm font-medium text-gray-700 mb-3">관리 필요</p>
        <div className="grid grid-cols-3 gap-3">
          {alertData.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className={`p-3 rounded-lg ${item.bgColor} flex items-center gap-3`}
              >
                <div className="p-2 bg-white rounded-lg">
                  <Icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-600">{item.label}</p>
                  <p className={`text-lg font-bold ${item.color}`}>
                    {item.count}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Quick Action */}
      {(stats.noContact30Days > 0 || stats.upcomingFollowups > 0) && (
        <div className="px-4 pb-4">
          <Link
            href="/candidates?filter=reactivation"
            className="block w-full text-center py-2 px-4 bg-primary/5 hover:bg-primary/10 text-primary text-sm font-medium rounded-lg transition-colors"
          >
            재활성 대상 후보자 보기
          </Link>
        </div>
      )}
    </div>
  );
}

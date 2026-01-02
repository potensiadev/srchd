"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Settings,
  User,
  CreditCard,
  Bell,
  Shield,
  LogOut,
  Loader2,
  Check,
  ChevronRight,
  Mail,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useCredits } from "@/hooks";

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  plan: string;
  created_at: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "subscription" | "notifications">("profile");

  // Form states
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  const supabase = createClient();
  const router = useRouter();

  // Credits from API (synchronized with CreditCounter)
  const { data: creditsData, isLoading: creditsLoading } = useCredits();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("id, name, company, plan, created_at")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      if (!data) return;

      const userData = data as { id: string; name: string | null; company: string | null; plan: string; created_at: string };
      setProfile({
        id: userData.id,
        email: user.email || "",
        name: userData.name,
        company: userData.company,
        plan: userData.plan,
        created_at: userData.created_at,
      });
      setName(userData.name || "");
      setCompany(userData.company || "");
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;

    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("users")
        .update({
          name: name || null,
          company: company || null,
        })
        .eq("id", profile.id);

      if (error) throw error;

      setProfile({ ...profile, name, company });
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const tabs = [
    { id: "profile", label: "프로필", icon: User },
    { id: "subscription", label: "구독", icon: CreditCard },
    { id: "notifications", label: "알림", icon: Bell },
  ] as const;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20 text-slate-400">
        프로필을 불러올 수 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">
          계정 설정 및 구독 관리
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors",
                activeTab === tab.id
                  ? "bg-primary/20 text-primary"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}

          <hr className="my-4 border-white/10" />

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            로그아웃
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 rounded-xl bg-white/5 border border-white/10 p-6">
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white">프로필 설정</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    이메일
                  </label>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                    <Mail className="w-5 h-5 text-slate-500" />
                    <span className="text-white">{profile.email}</span>
                    <span className="ml-auto text-xs text-slate-500">변경 불가</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    이름
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10
                             text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    회사
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="회사명을 입력하세요"
                      className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/5 border border-white/10
                               text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary/90
                           text-white font-medium transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  저장
                </button>
              </div>
            </div>
          )}

          {/* Subscription Tab */}
          {activeTab === "subscription" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white">구독 관리</h2>

              {/* Current Plan */}
              <div className="p-6 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/30">
                {creditsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-400">현재 플랜</p>
                        <p className="text-2xl font-bold text-white capitalize mt-1">
                          {creditsData?.plan || profile.plan}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-400">이번 달 사용량</p>
                        <p className="text-2xl font-bold text-white mt-1">
                          {creditsData?.creditsUsedThisMonth ?? 0} / {creditsData?.planBaseCredits ?? 50}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              ((creditsData?.creditsUsedThisMonth ?? 0) / (creditsData?.planBaseCredits ?? 50)) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-slate-400">
                        <span>남은 크레딧: {creditsData?.remainingCredits?.toLocaleString() ?? 0}</span>
                        <span>추가 크레딧: {creditsData?.credits?.toLocaleString() ?? 0}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Plan Options */}
              <div className="space-y-4">
                <h3 className="font-medium text-white">플랜 변경</h3>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { id: "starter", name: "Starter", price: "무료", credits: 50 },
                    { id: "pro", name: "Pro", price: "₩49,000/월", credits: 150 },
                    { id: "enterprise", name: "Enterprise", price: "문의", credits: 300 },
                  ].map((planOption) => {
                    const currentPlan = creditsData?.plan || profile.plan;
                    const isCurrentPlan = currentPlan === planOption.id;
                    return (
                      <div
                        key={planOption.id}
                        className={cn(
                          "p-4 rounded-xl border transition-colors",
                          isCurrentPlan
                            ? "bg-primary/20 border-primary"
                            : "bg-white/5 border-white/10 hover:border-white/30"
                        )}
                      >
                        <h4 className="font-semibold text-white">{planOption.name}</h4>
                        <p className="text-xl font-bold text-primary mt-2">{planOption.price}</p>
                        <p className="text-sm text-slate-400 mt-1">월 {planOption.credits}건</p>
                        {isCurrentPlan && (
                          <span className="inline-flex items-center gap-1 mt-3 text-xs text-primary">
                            <Check className="w-3 h-3" />
                            현재 플랜
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white">알림 설정</h2>

              <div className="space-y-4">
                {[
                  { id: "processing", label: "처리 완료 알림", desc: "이력서 분석이 완료되면 알림을 받습니다" },
                  { id: "weekly", label: "주간 리포트", desc: "매주 월요일 분석 통계를 이메일로 받습니다" },
                  { id: "warning", label: "위험 알림", desc: "낮은 신뢰도 후보자가 발생하면 알림을 받습니다" },
                ].map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div>
                      <p className="font-medium text-white">{item.label}</p>
                      <p className="text-sm text-slate-400">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Plus,
  X,
  Briefcase,
  Building2,
  Users,
  GraduationCap,
  MapPin,
  Calendar,
  DollarSign,
  FileText,
  Upload,
  Sparkles,
  CheckCircle,
  ClipboardList,
  ListChecks,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { PositionPriority, JobType } from "@/types/position";

interface FormData {
  title: string;
  clientCompany: string;
  department: string;
  description: string;
  responsibilities: string;
  qualifications: string;
  preferredQualifications: string;
  benefits: string;
  requiredSkills: string[];
  preferredSkills: string[];
  minExpYears: number;
  maxExpYears: number | null;
  requiredEducationLevel: string;
  preferredMajors: string[];
  locationCity: string;
  jobType: JobType | "";
  salaryMin: number | null;
  salaryMax: number | null;
  priority: PositionPriority;
  deadline: string;
}

const JOB_TYPES: { value: JobType | ""; label: string }[] = [
  { value: "", label: "선택 안 함" },
  { value: "full-time", label: "정규직" },
  { value: "contract", label: "계약직" },
  { value: "freelance", label: "프리랜서" },
  { value: "internship", label: "인턴" },
];

const PRIORITIES: { value: PositionPriority; label: string; description: string }[] = [
  { value: "urgent", label: "긴급", description: "즉시 채용 필요" },
  { value: "high", label: "높음", description: "2주 내 채용 목표" },
  { value: "normal", label: "보통", description: "1개월 내 채용 목표" },
  { value: "low", label: "낮음", description: "적합한 인재 발굴 시" },
];

const EDUCATION_LEVELS = [
  { value: "", label: "무관" },
  { value: "high_school", label: "고졸" },
  { value: "associate", label: "전문학사" },
  { value: "bachelor", label: "학사" },
  { value: "master", label: "석사" },
  { value: "doctorate", label: "박사" },
];

export default function NewPositionPage() {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedFileName, setExtractedFileName] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [preferredSkillInput, setPreferredSkillInput] = useState("");
  const [majorInput, setMajorInput] = useState("");
  const [requiredSkillsText, setRequiredSkillsText] = useState("");
  const [preferredSkillsText, setPreferredSkillsText] = useState("");
  const [salaryError, setSalaryError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    title: "",
    clientCompany: "",
    department: "",
    description: "",
    responsibilities: "",
    qualifications: "",
    preferredQualifications: "",
    benefits: "",
    requiredSkills: [],
    preferredSkills: [],
    minExpYears: 0,
    maxExpYears: null,
    requiredEducationLevel: "",
    preferredMajors: [],
    locationCity: "",
    jobType: "",
    salaryMin: null,
    salaryMax: null,
    priority: "normal",
    deadline: "",
  });

  // JD 파일 업로드 처리
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 검증
    const allowedTypes = [".pdf", ".docx", ".doc"];
    const extension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowedTypes.includes(extension)) {
      toast.error("오류", "PDF, DOCX, DOC 파일만 지원됩니다.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("오류", "파일 크기가 5MB를 초과합니다.");
      return;
    }

    setIsExtracting(true);
    setExtractedFileName(null);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append("file", file);

      const response = await fetch("/api/positions/extract", {
        method: "POST",
        body: formDataToSend,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "JD 분석에 실패했습니다.");
      }

      // 추출된 데이터로 폼 채우기
      const extracted = data.data;
      setFormData((prev) => ({
        ...prev,
        title: extracted.title || prev.title,
        clientCompany: extracted.clientCompany || prev.clientCompany,
        department: extracted.department || prev.department,
        description: extracted.description || prev.description,
        responsibilities: extracted.responsibilities || prev.responsibilities,
        qualifications: extracted.qualifications || prev.qualifications,
        preferredQualifications: extracted.preferredQualifications || prev.preferredQualifications,
        benefits: extracted.benefits || prev.benefits,
        requiredSkills: extracted.requiredSkills?.length > 0 ? extracted.requiredSkills : prev.requiredSkills,
        preferredSkills: extracted.preferredSkills?.length > 0 ? extracted.preferredSkills : prev.preferredSkills,
        minExpYears: extracted.minExpYears ?? prev.minExpYears,
        maxExpYears: extracted.maxExpYears,
        requiredEducationLevel: extracted.requiredEducationLevel || prev.requiredEducationLevel,
        preferredMajors: extracted.preferredMajors?.length > 0 ? extracted.preferredMajors : prev.preferredMajors,
        locationCity: extracted.locationCity || prev.locationCity,
        jobType: extracted.jobType !== undefined ? (extracted.jobType as JobType | "") : prev.jobType,
        salaryMin: extracted.salaryMin,
        salaryMax: extracted.salaryMax,
        deadline: extracted.deadline || prev.deadline,
      }));

      // 추출된 스킬 텍스트 필드 채우기
      if (extracted.requiredSkills?.length > 0) {
        setRequiredSkillsText(extracted.requiredSkills.join(", "));
      }
      if (extracted.preferredSkills?.length > 0) {
        setPreferredSkillsText(extracted.preferredSkills.join(", "));
      }

      setExtractedFileName(file.name);
      toast.success("추출 완료", "JD에서 정보가 추출되었습니다. 내용을 확인하고 수정해주세요.");
    } catch (error) {
      console.error("JD extraction error:", error);
      toast.error("오류", error instanceof Error ? error.message : "JD 분석에 실패했습니다.");
    } finally {
      setIsExtracting(false);
      // 파일 입력 초기화 (같은 파일 재선택 가능하도록)
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.title.trim()) {
      toast.error("오류", "포지션명을 입력해주세요.");
      return;
    }

    // Salary validation
    if (formData.salaryMin !== null && formData.salaryMax !== null && formData.salaryMax < formData.salaryMin) {
      setSalaryError("연봉 상한 금액이 연봉 하한 금액보다 낮게 입력되었어요. 다시 확인해주세요.");
      toast.error("오류", "연봉 상한 금액이 연봉 하한 금액보다 낮게 입력되었어요. 다시 확인해주세요.");
      return;
    }
    setSalaryError(null);

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "포지션 생성에 실패했습니다.");
      }

      // Optimistic navigation: redirect immediately, toast in parallel
      const targetUrl = `/positions/${data.data.id}`;
      router.prefetch(targetUrl);
      toast.success("성공", "포지션이 생성되었습니다.");
      router.push(targetUrl);
    } catch (error) {
      console.error("Create position error:", error);
      toast.error("오류", error instanceof Error ? error.message : "포지션 생성에 실패했습니다.");
      setIsSubmitting(false);
    }
  };

  const addSkill = (type: "required" | "preferred") => {
    const input = type === "required" ? skillInput : preferredSkillInput;
    const setInput = type === "required" ? setSkillInput : setPreferredSkillInput;
    const field = type === "required" ? "requiredSkills" : "preferredSkills";

    if (!input.trim()) return;

    const skills = input.split(",").map((s) => s.trim()).filter(Boolean);
    const currentSkills = formData[field];
    const newSkills = skills.filter((s) => !currentSkills.includes(s));

    if (newSkills.length > 0) {
      setFormData({ ...formData, [field]: [...currentSkills, ...newSkills] });
    }
    setInput("");
  };

  const removeSkill = (type: "required" | "preferred", skill: string) => {
    const field = type === "required" ? "requiredSkills" : "preferredSkills";
    setFormData({
      ...formData,
      [field]: formData[field].filter((s) => s !== skill),
    });
  };

  const addMajor = () => {
    if (!majorInput.trim()) return;
    if (!formData.preferredMajors.includes(majorInput.trim())) {
      setFormData({
        ...formData,
        preferredMajors: [...formData.preferredMajors, majorInput.trim()],
      });
    }
    setMajorInput("");
  };

  const removeMajor = (major: string) => {
    setFormData({
      ...formData,
      preferredMajors: formData.preferredMajors.filter((m) => m !== major),
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/positions"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">새 포지션 등록</h1>
          <p className="text-gray-500 text-sm mt-1">
            채용 포지션 정보를 입력하고 후보자 매칭을 시작하세요
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* JD 자동 추출 */}
        <section className="p-6 rounded-2xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/10 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <Sparkles className="w-5 h-5 text-primary" />
            JD에서 자동 추출
          </div>
          <p className="text-sm text-gray-500">
            JD(채용공고) 파일을 업로드하면 AI가 자동으로 포지션 정보를 추출합니다.
          </p>

          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={handleFileUpload}
              className="hidden"
              id="jd-upload"
            />
            <label
              htmlFor="jd-upload"
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer transition-all shadow-sm",
                isExtracting
                  ? "bg-primary/10 text-primary cursor-not-allowed"
                  : "bg-white border border-primary/20 text-primary hover:border-primary hover:bg-primary/5"
              )}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  JD 파일 업로드
                </>
              )}
            </label>
            <span className="text-xs text-gray-400">
              PDF, DOCX, DOC (최대 5MB)
            </span>

            {extractedFileName && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle className="w-4 h-4" />
                {extractedFileName}에서 추출 완료
              </span>
            )}
          </div>
        </section>

        {/* 기본 정보 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <Briefcase className="w-5 h-5 text-gray-400" />
            기본 정보
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-gray-500 mb-2">
                포지션명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="예: 시니어 백엔드 개발자"
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200
                         text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">
                <Building2 className="w-4 h-4 inline mr-1" />
                고객사
              </label>
              <input
                type="text"
                value={formData.clientCompany}
                onChange={(e) => setFormData({ ...formData, clientCompany: e.target.value })}
                placeholder="회사명"
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200
                         text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">부서</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="예: 개발팀"
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200
                         text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-2">
              <FileText className="w-4 h-4 inline mr-1" />
              상세 설명 (JD)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="포지션 상세 설명, 담당 업무, 자격 요건 등을 입력하세요. 상세할수록 AI 매칭 정확도가 높아집니다."
              rows={6}
              className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200
                       text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
            />
          </div>
        </section>

        {/* 주요 업무 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <ClipboardList className="w-5 h-5 text-blue-500" />
            주요 업무
          </div>
          <p className="text-sm text-gray-500">
            JD에서 추출된 주요업무/담당업무 내용입니다. 수정하거나 직접 입력할 수 있습니다.
          </p>
          <textarea
            value={formData.responsibilities}
            onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
            placeholder="예:&#10;- 백엔드 시스템 설계 및 개발&#10;- API 개발 및 최적화&#10;- 데이터베이스 설계 및 관리"
            rows={6}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200
                     text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
          />
        </section>

        {/* 자격 요건 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <ListChecks className="w-5 h-5 text-emerald-500" />
            자격 요건
          </div>
          <p className="text-sm text-gray-500">
            JD에서 추출된 필수 자격요건 내용입니다. 학력, 경력, 기술 요건 등 전체 맥락이 보존됩니다.
          </p>
          <textarea
            value={formData.qualifications}
            onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
            placeholder="예:&#10;- 컴퓨터공학 또는 관련 전공 학사 이상&#10;- 백엔드 개발 경력 3년 이상&#10;- Python, Java 등 1개 이상 언어 능숙"
            rows={6}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200
                     text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
          />
        </section>

        {/* 우대 사항 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <Sparkles className="w-5 h-5 text-amber-500" />
            우대 사항
          </div>
          <p className="text-sm text-gray-500">
            JD에서 추출된 우대사항 내용입니다. 우대 조건의 전체 맥락이 보존됩니다.
          </p>
          <textarea
            value={formData.preferredQualifications}
            onChange={(e) => setFormData({ ...formData, preferredQualifications: e.target.value })}
            placeholder="예:&#10;- 대규모 트래픽 처리 경험&#10;- MSA 아키텍처 경험&#10;- 오픈소스 기여 경험"
            rows={6}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200
                     text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
          />
        </section>

        {/* 복리후생 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <Gift className="w-5 h-5 text-purple-500" />
            복리후생
            <span className="text-xs text-gray-400 font-normal">(선택)</span>
          </div>
          <p className="text-sm text-gray-500">
            JD에 복리후생 정보가 있으면 자동으로 추출됩니다.
          </p>
          <textarea
            value={formData.benefits}
            onChange={(e) => setFormData({ ...formData, benefits: e.target.value })}
            placeholder="예:&#10;- 유연근무제&#10;- 자기개발비 지원&#10;- 건강검진 지원"
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200
                     text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
          />
        </section>

        {/* 필수 스킬 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <Users className="w-5 h-5 text-primary" />
            필수 스킬
          </div>

          {/* 추출된 필수 스킬 텍스트 */}
          <div>
            <label className="block text-sm text-gray-500 mb-2">
              추출된 필수 스킬 (JD에서 추출)
            </label>
            <textarea
              value={requiredSkillsText}
              onChange={(e) => setRequiredSkillsText(e.target.value)}
              placeholder="JD 파일 업로드 시 자동으로 추출된 필수 스킬이 표시됩니다. 직접 입력하거나 수정할 수 있습니다."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200
                       text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
            />
          </div>

          {/* 필수 스킬 태그 입력 */}
          <div>
            <label className="block text-sm text-gray-500 mb-2">
              필수 스킬 태그
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill("required");
                  }
                }}
                placeholder="스킬 입력 후 Enter (쉼표로 여러 개 입력)"
                className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-200
                         text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
              <button
                type="button"
                onClick={() => addSkill("required")}
                className="px-4 py-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {formData.requiredSkills.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {formData.requiredSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill("required", skill)}
                      className="hover:text-primary/70 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 우대 스킬 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <Sparkles className="w-5 h-5 text-amber-500" />
            우대 스킬
          </div>

          {/* 추출된 우대 스킬 텍스트 */}
          <div>
            <label className="block text-sm text-gray-500 mb-2">
              추출된 우대 스킬 (JD에서 추출)
            </label>
            <textarea
              value={preferredSkillsText}
              onChange={(e) => setPreferredSkillsText(e.target.value)}
              placeholder="JD 파일 업로드 시 자동으로 추출된 우대 스킬이 표시됩니다. 직접 입력하거나 수정할 수 있습니다."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200
                       text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
            />
          </div>

          {/* 우대 스킬 태그 입력 */}
          <div>
            <label className="block text-sm text-gray-500 mb-2">
              우대 스킬 태그
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={preferredSkillInput}
                onChange={(e) => setPreferredSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill("preferred");
                  }
                }}
                placeholder="스킬 입력 후 Enter (쉼표로 여러 개 입력)"
                className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-200
                         text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
              <button
                type="button"
                onClick={() => addSkill("preferred")}
                className="px-4 py-3 rounded-xl bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {formData.preferredSkills.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {formData.preferredSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm font-medium border border-amber-200"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill("preferred", skill)}
                      className="hover:text-amber-900 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 경력 & 학력 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <GraduationCap className="w-5 h-5 text-gray-400" />
            경력 & 학력
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-2">
                최소 경력 (년) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={formData.minExpYears}
                onChange={(e) => setFormData({ ...formData, minExpYears: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200
                         text-gray-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">최대 경력 (년)</label>
              <input
                type="number"
                min="0"
                value={formData.maxExpYears ?? ""}
                onChange={(e) => setFormData({
                  ...formData,
                  maxExpYears: e.target.value ? parseInt(e.target.value) : null,
                })}
                placeholder="무관"
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200
                         text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">학력 요건</label>
              <select
                value={formData.requiredEducationLevel}
                onChange={(e) => setFormData({ ...formData, requiredEducationLevel: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900
                         focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer transition-all"
              >
                {EDUCATION_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">우대 전공</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={majorInput}
                  onChange={(e) => setMajorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMajor();
                    }
                  }}
                  placeholder="전공 입력"
                  className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-200
                           text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
                <button
                  type="button"
                  onClick={addMajor}
                  className="px-3 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {formData.preferredMajors.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.preferredMajors.map((major) => (
                    <span
                      key={major}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-xs font-medium"
                    >
                      {major}
                      <button type="button" onClick={() => removeMajor(major)}>
                        <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 근무 조건 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <MapPin className="w-5 h-5 text-gray-400" />
            근무 조건
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-2">근무 형태</label>
              <select
                value={formData.jobType}
                onChange={(e) => setFormData({ ...formData, jobType: e.target.value as JobType })}
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900
                         focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer transition-all"
              >
                {JOB_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">근무지</label>
              <input
                type="text"
                value={formData.locationCity}
                onChange={(e) => setFormData({ ...formData, locationCity: e.target.value })}
                placeholder="예: 서울 강남"
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200
                         text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                연봉 하한 (만원)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={formData.salaryMin ?? ""}
                onChange={(e) => {
                  const newMin = e.target.value ? parseInt(e.target.value) : null;
                  setFormData({ ...formData, salaryMin: newMin });
                  // Real-time validation
                  if (newMin !== null && formData.salaryMax !== null && formData.salaryMax < newMin) {
                    setSalaryError("연봉 상한 금액이 연봉 하한 금액보다 낮게 입력되었어요. 다시 확인해주세요.");
                  } else {
                    setSalaryError(null);
                  }
                }}
                placeholder="예: 5000"
                className={cn(
                  "w-full px-4 py-3 rounded-xl bg-white border text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all",
                  salaryError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                    : "border-gray-200 focus:border-primary focus:ring-primary/20"
                )}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">연봉 상한 (만원)</label>
              <input
                type="number"
                min="0"
                step="100"
                value={formData.salaryMax ?? ""}
                onChange={(e) => {
                  const newMax = e.target.value ? parseInt(e.target.value) : null;
                  setFormData({ ...formData, salaryMax: newMax });
                  // Real-time validation
                  if (formData.salaryMin !== null && newMax !== null && newMax < formData.salaryMin) {
                    setSalaryError("연봉 상한 금액이 연봉 하한 금액보다 낮게 입력되었어요. 다시 확인해주세요.");
                  } else {
                    setSalaryError(null);
                  }
                }}
                placeholder="예: 8000"
                className={cn(
                  "w-full px-4 py-3 rounded-xl bg-white border text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all",
                  salaryError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                    : "border-gray-200 focus:border-primary focus:ring-primary/20"
                )}
              />
            </div>
          </div>
          {salaryError && (
            <p className="text-sm text-red-500 mt-2">{salaryError}</p>
          )}
        </section>

        {/* 우선순위 & 마감일 */}
        <section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <Calendar className="w-5 h-5 text-gray-400" />
            우선순위 & 일정
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-2">우선순위</label>
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, priority: p.value })}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all",
                      formData.priority === p.value
                        ? "bg-primary/5 border-primary text-primary"
                        : "bg-white border-gray-200 text-gray-500 hover:border-primary/50 hover:bg-primary/5"
                    )}
                  >
                    <div className="font-medium text-sm">{p.label}</div>
                    <div className="text-xs opacity-70">{p.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">채용 마감일</label>
              <input
                type="date"
                value={formData.deadline}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200
                         text-gray-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>
        </section>

        {/* Submit Buttons */}
        <div className="flex items-center justify-end gap-4">
          <Link
            href="/positions"
            className="px-6 py-3 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all shadow-md active:scale-95",
              isSubmitting
                ? "bg-primary/50 text-white cursor-not-allowed"
                : "bg-primary hover:bg-primary/90 text-white"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                포지션 생성
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame,
  ThermometerSun,
  Snowflake,
  HelpCircle,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  MapPin,
  Banknote,
  Clock,
  ChevronDown,
  ChevronUp,
  Plus,
  Check,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type InterestLevel,
  type ContactType,
  type ContactOutcome,
  type ContactHistory,
  type CandidateDetail,
} from "@/types";

interface CandidateLifecycleProps {
  candidate: CandidateDetail;
  onUpdateLifecycle: (data: Partial<CandidateDetail>) => Promise<void>;
  onAddContact: (data: {
    contactType: ContactType;
    subject?: string;
    content?: string;
    outcome?: ContactOutcome;
    nextContactDate?: string;
    nextContactNote?: string;
  }) => Promise<void>;
  contactHistory?: ContactHistory[];
  isLoading?: boolean;
}

const INTEREST_LEVEL_CONFIG: Record<
  InterestLevel,
  { icon: typeof Flame; label: string; color: string; bgColor: string }
> = {
  hot: {
    icon: Flame,
    label: "Hot",
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-200",
  },
  warm: {
    icon: ThermometerSun,
    label: "Warm",
    color: "text-orange-500",
    bgColor: "bg-orange-50 border-orange-200",
  },
  cold: {
    icon: Snowflake,
    label: "Cold",
    color: "text-blue-500",
    bgColor: "bg-blue-50 border-blue-200",
  },
  unknown: {
    icon: HelpCircle,
    label: "Unknown",
    color: "text-gray-400",
    bgColor: "bg-gray-50 border-gray-200",
  },
};

const CONTACT_TYPE_CONFIG: Record<
  ContactType,
  { icon: typeof Phone; label: string }
> = {
  phone: { icon: Phone, label: "전화" },
  email: { icon: Mail, label: "이메일" },
  linkedin: { icon: MessageSquare, label: "LinkedIn" },
  meeting: { icon: Calendar, label: "미팅" },
  note: { icon: MessageSquare, label: "메모" },
};

const OUTCOME_CONFIG: Record<
  ContactOutcome,
  { label: string; color: string }
> = {
  interested: { label: "관심 있음", color: "text-green-600 bg-green-50" },
  not_interested: { label: "관심 없음", color: "text-red-600 bg-red-50" },
  no_response: { label: "무응답", color: "text-gray-500 bg-gray-50" },
  callback: { label: "콜백 예정", color: "text-blue-600 bg-blue-50" },
  rejected: { label: "거절", color: "text-red-600 bg-red-50" },
  pending: { label: "대기 중", color: "text-yellow-600 bg-yellow-50" },
};

export default function CandidateLifecycle({
  candidate,
  onUpdateLifecycle,
  onAddContact,
  contactHistory = [],
  isLoading = false,
}: CandidateLifecycleProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editData, setEditData] = useState({
    interestLevel: candidate.interestLevel,
    salaryExpectationMin: candidate.salaryExpectationMin,
    salaryExpectationMax: candidate.salaryExpectationMax,
    locationPreferences: candidate.locationPreferences?.join(", ") || "",
    earliestStartDate: candidate.earliestStartDate || "",
    availabilityNotes: candidate.availabilityNotes || "",
  });
  const [contactFormData, setContactFormData] = useState({
    contactType: "phone" as ContactType,
    subject: "",
    content: "",
    outcome: "pending" as ContactOutcome,
    nextContactDate: "",
    nextContactNote: "",
  });

  const currentConfig = INTEREST_LEVEL_CONFIG[candidate.interestLevel];
  const Icon = currentConfig.icon;

  const handleSave = async () => {
    await onUpdateLifecycle({
      interestLevel: editData.interestLevel,
      salaryExpectationMin: editData.salaryExpectationMin,
      salaryExpectationMax: editData.salaryExpectationMax,
      locationPreferences: editData.locationPreferences
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      earliestStartDate: editData.earliestStartDate || undefined,
      availabilityNotes: editData.availabilityNotes || undefined,
    });
    setIsEditing(false);
  };

  const handleAddContact = async () => {
    await onAddContact({
      contactType: contactFormData.contactType,
      subject: contactFormData.subject || undefined,
      content: contactFormData.content || undefined,
      outcome: contactFormData.outcome,
      nextContactDate: contactFormData.nextContactDate || undefined,
      nextContactNote: contactFormData.nextContactNote || undefined,
    });
    setShowContactForm(false);
    setContactFormData({
      contactType: "phone",
      subject: "",
      content: "",
      outcome: "pending",
      nextContactDate: "",
      nextContactNote: "",
    });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // useMemo로 계산하여 렌더 순수성 보장
  const daysSinceLastContact = useMemo(() => {
    if (!candidate.lastContactAt) return null;
    const now = Date.now();
    const lastContact = new Date(candidate.lastContactAt).getTime();
    return Math.floor((now - lastContact) / (1000 * 60 * 60 * 24));
  }, [candidate.lastContactAt]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${currentConfig.bgColor} border`}>
            <Icon className={`w-5 h-5 ${currentConfig.color}`} />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">후보자 상태</h3>
            <p className="text-sm text-gray-500">
              이직 의향: {currentConfig.label}
              {daysSinceLastContact !== null && (
                <span className="ml-2">
                  (마지막 연락: {daysSinceLastContact}일 전)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={`${currentConfig.bgColor} ${currentConfig.color} border`}
          >
            연락 {candidate.contactCount}회
          </Badge>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
              {/* Interest Level Selector */}
              <div className="pt-4">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  이직 의향
                </label>
                <div className="flex gap-2">
                  {(
                    Object.entries(INTEREST_LEVEL_CONFIG) as [
                      InterestLevel,
                      (typeof INTEREST_LEVEL_CONFIG)[InterestLevel]
                    ][]
                  ).map(([level, config]) => {
                    const LevelIcon = config.icon;
                    const isSelected = isEditing
                      ? editData.interestLevel === level
                      : candidate.interestLevel === level;
                    return (
                      <button
                        key={level}
                        onClick={() =>
                          isEditing
                            ? setEditData({ ...editData, interestLevel: level })
                            : null
                        }
                        disabled={!isEditing}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
                          isSelected
                            ? `${config.bgColor} ${config.color} border-current`
                            : "bg-gray-50 text-gray-400 border-gray-200"
                        } ${
                          isEditing
                            ? "cursor-pointer hover:opacity-80"
                            : "cursor-default"
                        }`}
                      >
                        <LevelIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          {config.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Salary */}
                <div>
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1.5">
                    <Banknote className="w-4 h-4" />
                    희망 연봉 (만원)
                  </label>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editData.salaryExpectationMin || ""}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            salaryExpectationMin: e.target.value
                              ? parseInt(e.target.value)
                              : undefined,
                          })
                        }
                        placeholder="최소"
                        className="w-24 px-2 py-1.5 text-sm border rounded-lg"
                      />
                      <span className="text-gray-400">~</span>
                      <input
                        type="number"
                        value={editData.salaryExpectationMax || ""}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            salaryExpectationMax: e.target.value
                              ? parseInt(e.target.value)
                              : undefined,
                          })
                        }
                        placeholder="최대"
                        className="w-24 px-2 py-1.5 text-sm border rounded-lg"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-900">
                      {candidate.salaryExpectationMin ||
                      candidate.salaryExpectationMax
                        ? `${candidate.salaryExpectationMin?.toLocaleString() || "?"} ~ ${candidate.salaryExpectationMax?.toLocaleString() || "?"} 만원`
                        : "-"}
                    </p>
                  )}
                </div>

                {/* Location */}
                <div>
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1.5">
                    <MapPin className="w-4 h-4" />
                    희망 근무지
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editData.locationPreferences}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          locationPreferences: e.target.value,
                        })
                      }
                      placeholder="서울, 판교 (쉼표로 구분)"
                      className="w-full px-2 py-1.5 text-sm border rounded-lg"
                    />
                  ) : (
                    <p className="text-sm text-gray-900">
                      {candidate.locationPreferences?.length
                        ? candidate.locationPreferences.join(", ")
                        : "-"}
                    </p>
                  )}
                </div>

                {/* Start Date */}
                <div>
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1.5">
                    <Calendar className="w-4 h-4" />
                    입사 가능일
                  </label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editData.earliestStartDate}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          earliestStartDate: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1.5 text-sm border rounded-lg"
                    />
                  ) : (
                    <p className="text-sm text-gray-900">
                      {formatDate(candidate.earliestStartDate)}
                    </p>
                  )}
                </div>

                {/* Last Contact */}
                <div>
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1.5">
                    <Clock className="w-4 h-4" />
                    마지막 연락
                  </label>
                  <p className="text-sm text-gray-900">
                    {candidate.lastContactAt
                      ? formatDateTime(candidate.lastContactAt)
                      : "연락 이력 없음"}
                    {daysSinceLastContact !== null &&
                      daysSinceLastContact > 30 && (
                        <span className="ml-2 text-yellow-600 text-xs">
                          (30일 이상 미접촉)
                        </span>
                      )}
                  </p>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  메모 (이직 동기, 제약사항)
                </label>
                {isEditing ? (
                  <textarea
                    value={editData.availabilityNotes}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        availabilityNotes: e.target.value,
                      })
                    }
                    placeholder="이직 동기, 현재 상황, 제약조건 등을 기록하세요"
                    rows={3}
                    className="w-full px-3 py-2 text-sm border rounded-lg resize-none"
                  />
                ) : (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    {candidate.availabilityNotes || "메모 없음"}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-2">
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={isLoading}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        저장
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsEditing(false)}
                      >
                        취소
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                    >
                      수정
                    </Button>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowContactForm(!showContactForm)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  연락 기록 추가
                </Button>
              </div>

              {/* Contact Form */}
              <AnimatePresence>
                {showContactForm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
                      <h4 className="font-medium text-gray-900">
                        새 연락 기록
                      </h4>

                      {/* Contact Type */}
                      <div className="flex gap-2">
                        {(
                          Object.entries(CONTACT_TYPE_CONFIG) as [
                            ContactType,
                            (typeof CONTACT_TYPE_CONFIG)[ContactType]
                          ][]
                        ).map(([type, config]) => {
                          const TypeIcon = config.icon;
                          return (
                            <button
                              key={type}
                              onClick={() =>
                                setContactFormData({
                                  ...contactFormData,
                                  contactType: type,
                                })
                              }
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                                contactFormData.contactType === type
                                  ? "bg-primary text-white border-primary"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              <TypeIcon className="w-4 h-4" />
                              {config.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Subject & Content */}
                      <input
                        type="text"
                        value={contactFormData.subject}
                        onChange={(e) =>
                          setContactFormData({
                            ...contactFormData,
                            subject: e.target.value,
                          })
                        }
                        placeholder="제목 (선택)"
                        className="w-full px-3 py-2 text-sm border rounded-lg"
                      />
                      <textarea
                        value={contactFormData.content}
                        onChange={(e) =>
                          setContactFormData({
                            ...contactFormData,
                            content: e.target.value,
                          })
                        }
                        placeholder="내용을 입력하세요"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border rounded-lg resize-none"
                      />

                      {/* Outcome */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                          결과
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(
                            Object.entries(OUTCOME_CONFIG) as [
                              ContactOutcome,
                              (typeof OUTCOME_CONFIG)[ContactOutcome]
                            ][]
                          ).map(([outcome, config]) => (
                            <button
                              key={outcome}
                              onClick={() =>
                                setContactFormData({
                                  ...contactFormData,
                                  outcome,
                                })
                              }
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                contactFormData.outcome === outcome
                                  ? config.color + " ring-2 ring-offset-1"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {config.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Next Contact */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">
                            다음 연락일 (선택)
                          </label>
                          <input
                            type="date"
                            value={contactFormData.nextContactDate}
                            onChange={(e) =>
                              setContactFormData({
                                ...contactFormData,
                                nextContactDate: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 text-sm border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">
                            다음 연락 메모
                          </label>
                          <input
                            type="text"
                            value={contactFormData.nextContactNote}
                            onChange={(e) =>
                              setContactFormData({
                                ...contactFormData,
                                nextContactNote: e.target.value,
                              })
                            }
                            placeholder="무엇을 확인할지"
                            className="w-full px-3 py-2 text-sm border rounded-lg"
                          />
                        </div>
                      </div>

                      {/* Submit */}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowContactForm(false)}
                        >
                          취소
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleAddContact}
                          disabled={isLoading}
                        >
                          저장
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Contact History */}
              {contactHistory.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    연락 이력 ({contactHistory.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {contactHistory.map((contact) => {
                      const typeConfig = CONTACT_TYPE_CONFIG[contact.contactType];
                      const outcomeConfig = OUTCOME_CONFIG[contact.outcome];
                      const ContactIcon = typeConfig.icon;
                      return (
                        <div
                          key={contact.id}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="p-1.5 bg-white rounded-lg border">
                            <ContactIcon className="w-4 h-4 text-gray-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {typeConfig.label}
                                {contact.subject && ` - ${contact.subject}`}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs ${outcomeConfig.color}`}
                              >
                                {outcomeConfig.label}
                              </span>
                            </div>
                            {contact.content && (
                              <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                {contact.content}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {formatDateTime(contact.contactedAt)}
                            </p>
                            {contact.nextContactDate && (
                              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                다음 연락: {formatDate(contact.nextContactDate)}
                                {contact.nextContactNote &&
                                  ` (${contact.nextContactNote})`}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X, AlertTriangle, Info } from "lucide-react";

interface EditableFieldProps {
  label: string;
  value: string | number | null | undefined;
  fieldKey: string;
  type?: "text" | "number" | "textarea";
  placeholder?: string;
  confidence?: number;
  hasWarning?: boolean;
  warningMessage?: string;
  isEditing?: boolean;
  onEdit?: (key: string, value: string | number) => void;
  onSave?: (key: string, value: string | number) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export default function EditableField({
  label,
  value,
  fieldKey,
  type = "text",
  placeholder = "입력되지 않음",
  confidence,
  hasWarning = false,
  warningMessage,
  onSave,
  disabled = false,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // value prop이 변경되면 editValue 동기화 (편집 중이 아닐 때만)
  // 외부 상태(value prop)와 로컬 상태(editValue) 동기화를 위한 의도적 패턴
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value?.toString() ?? "");
    }
     
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    // 빈 값 처리: number 타입에서 빈 문자열은 null로 처리
    if (editValue.trim() === "") {
      // 빈 값이면 저장하지 않음 (또는 null로 처리)
      onSave?.(fieldKey, type === "number" ? 0 : "");
    } else {
      const newValue = type === "number" ? Number(editValue) : editValue;
      onSave?.(fieldKey, newValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value?.toString() ?? "");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && type !== "textarea") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const displayValue = value?.toString() || "";
  const isEmpty = !displayValue;
  const isModified = editValue !== (value?.toString() ?? "");

  // Confidence color
  const getConfidenceColor = (conf?: number) => {
    if (!conf) return "text-gray-400";
    if (conf >= 0.95) return "text-emerald-600";
    if (conf >= 0.8) return "text-yellow-600";
    return "text-red-500";
  };

  // Confidence bar color
  const getConfidenceBarColor = (conf?: number) => {
    if (!conf) return "bg-gray-300";
    if (conf >= 0.95) return "bg-emerald-500";
    if (conf >= 0.8) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="group relative">
      {/* Label Row */}
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {label}
        </label>

        {/* Confidence Badge with Progress Bar */}
        {confidence !== undefined && (
          <div
            className="flex items-center gap-1.5"
            title={`AI 신뢰도: ${Math.round(confidence * 100)}%`}
          >
            {/* Progress Bar */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${getConfidenceBarColor(confidence)}`}
                style={{ width: `${Math.round(confidence * 100)}%` }}
              />
            </div>
            {/* Percentage Text */}
            <span className={`text-xs font-mono font-medium ${getConfidenceColor(confidence)}`}>
              {Math.round(confidence * 100)}%
            </span>
          </div>
        )}

        {/* Warning Badge */}
        {hasWarning && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-50 border border-yellow-200">
            <AlertTriangle className="w-3 h-3 text-yellow-600" />
            <span className="text-xs text-yellow-700 font-medium">확인 필요</span>
          </div>
        )}

        {/* Modified Badge */}
        {isModified && !isEditing && (
          <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
            수정됨
          </span>
        )}
      </div>

      {/* Value/Input */}
      <div className="relative">
        {isEditing ? (
          <div className="flex items-center gap-2">
            {type === "textarea" ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 px-3 py-2 rounded-lg bg-white border border-primary/50 ring-2 ring-primary/20
                         text-gray-900 text-sm focus:outline-none
                         min-h-[80px] resize-y shadow-sm transition-all"
                placeholder={placeholder}
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={type}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 px-3 py-2 rounded-lg bg-white border border-primary/50 ring-2 ring-primary/20
                         text-gray-900 text-sm focus:outline-none shadow-sm transition-all"
                placeholder={placeholder}
              />
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-1">
              <button
                onClick={handleSave}
                className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 hover:bg-emerald-100
                         text-emerald-600 transition-colors shadow-sm"
                title="저장 (Enter)"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancel}
                className="p-2 rounded-lg bg-red-50 border border-red-100 hover:bg-red-100
                         text-red-500 transition-colors shadow-sm"
                title="취소 (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg
                       bg-white border transition-all cursor-pointer shadow-sm group-hover:shadow-md
                       ${hasWarning
                ? "border-yellow-200 hover:border-yellow-300 bg-yellow-50/30"
                : "border-gray-200 hover:border-primary/30"
              }
                       ${disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : ""}`}
            onClick={() => !disabled && setIsEditing(true)}
          >
            <span
              className={`text-sm ${isEmpty ? "text-gray-400 italic" : "text-gray-900"
                }`}
            >
              {isEmpty ? placeholder : displayValue}
            </span>

            {!disabled && (
              <Pencil className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        )}
      </div>

      {/* Warning Message */}
      {warningMessage && (
        <div className="flex items-start gap-1.5 mt-2">
          <Info className="w-3.5 h-3.5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-yellow-700">{warningMessage}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { ReactNode } from "react";
import { AlertTriangle, Trash2, AlertCircle, HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./dialog";
import { Button } from "./button";

type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: ConfirmVariant;
  isLoading?: boolean;
  children?: ReactNode;
}

const variantConfig = {
  danger: {
    icon: Trash2,
    iconBg: "bg-red-500/20",
    iconColor: "text-red-400",
    buttonVariant: "destructive" as const,
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-yellow-500/20",
    iconColor: "text-yellow-400",
    buttonVariant: "default" as const,
  },
  info: {
    icon: HelpCircle,
    iconBg: "bg-blue-500/20",
    iconColor: "text-blue-400",
    buttonVariant: "default" as const,
  },
};

/**
 * 확인 다이얼로그 컴포넌트
 * window.confirm 대체용
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  onConfirm,
  onCancel,
  variant = "danger",
  isLoading = false,
  children,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleConfirm = async () => {
    try {
      await Promise.resolve(onConfirm());
      if (!isLoading) {
        onOpenChange(false);
      }
    } catch (error) {
      // BUG-006: 에러 발생 시에도 다이얼로그 닫기 (UX 개선)
      console.error('Confirm action failed:', error);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${config.iconBg}`}>
              <Icon className={`w-6 h-6 ${config.iconColor}`} />
            </div>
            <div className="flex-1">
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-2">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        {children && <div className="py-2">{children}</div>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={config.buttonVariant}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "처리 중..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 삭제 확인 다이얼로그 (자주 사용되는 패턴)
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemName,
  itemType = "항목",
  onConfirm,
  isLoading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName?: string;
  itemType?: string;
  onConfirm: () => void;
  isLoading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${itemType} 삭제`}
      description={
        itemName
          ? `"${itemName}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
          : `이 ${itemType}을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
      }
      confirmLabel="삭제"
      variant="danger"
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}

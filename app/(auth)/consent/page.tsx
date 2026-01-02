"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Shield, Loader2 } from "lucide-react";

export default function ConsentPage() {
  const router = useRouter();

  const [consents, setConsents] = useState({
    terms: false,
    privacy: false,
    thirdParty: false,
    marketing: false,
  });

  const [viewingDoc, setViewingDoc] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRequiredChecked =
    consents.terms && consents.privacy && consents.thirdParty;

  const handleCheckAll = () => {
    const newValue = !allRequiredChecked;
    setConsents({
      terms: newValue,
      privacy: newValue,
      thirdParty: newValue,
      marketing: newValue,
    });
  };

  const handleSubmit = async () => {
    if (!allRequiredChecked) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const now = new Date().toISOString();
      const version = "2025.01.01";

      // 동의 기록 저장
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: consentError } = await (supabase as any)
        .from("user_consents")
        .insert({
          user_id: user.id,
          terms_of_service: true,
          terms_of_service_version: version,
          terms_of_service_agreed_at: now,
          privacy_policy: true,
          privacy_policy_version: version,
          privacy_policy_agreed_at: now,
          third_party_data_guarantee: true,
          third_party_data_guarantee_version: version,
          third_party_data_guarantee_agreed_at: now,
          marketing_consent: consents.marketing,
          marketing_consent_agreed_at: consents.marketing ? now : null,
        });

      if (consentError) throw consentError;

      // 사용자 프로필 업데이트
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: userError } = await (supabase as any)
        .from("users")
        .update({
          consents_completed: true,
          consents_completed_at: now,
        })
        .eq("id", user.id);

      if (userError) throw userError;

      router.push("/candidates");
      router.refresh();
    } catch (err) {
      console.error("Consent error:", err);
      setError("동의 저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Shield className="w-12 h-12 mx-auto text-primary" />
        <h1 className="text-2xl font-bold text-white">서비스 이용 동의</h1>
        <p className="text-slate-400 text-sm">
          HR Screener 서비스 이용을 위해 아래 약관에 동의해주세요.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-[#0F0F24]/60 backdrop-blur-md border border-white/5 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 전체 동의 */}
        <div className="p-4 bg-white/5 rounded-lg">
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={allRequiredChecked && consents.marketing}
              onCheckedChange={handleCheckAll}
            />
            <span className="font-medium text-white">모두 동의합니다</span>
          </label>
        </div>

        <div className="space-y-3">
          {/* 이용약관 */}
          <ConsentItem
            label="서비스 이용약관"
            required
            checked={consents.terms}
            onCheckedChange={(v) => setConsents({ ...consents, terms: v })}
            onViewClick={() => setViewingDoc("terms")}
          />

          {/* 개인정보처리방침 */}
          <ConsentItem
            label="개인정보 처리방침"
            required
            checked={consents.privacy}
            onCheckedChange={(v) => setConsents({ ...consents, privacy: v })}
            onViewClick={() => setViewingDoc("privacy")}
          />

          <ConsentItem
            label="제3자 개인정보 처리 보증"
            required
            checked={consents.thirdParty}
            onCheckedChange={(v) => setConsents({ ...consents, thirdParty: v })}
            onViewClick={() => setViewingDoc("thirdParty")}
          />

          {/* 제3자 정보 보증 (핵심) */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 text-sm">
            <div className="flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-amber-200">
                <p className="font-medium">중요 안내</p>
                <p className="mt-1 text-amber-300/80">
                  업로드하는 이력서의 정보주체(후보자)로부터 개인정보 수집·이용 동의를 받았음을 보증합니다.
                </p>
              </div>
            </div>
          </div>

          {/* 마케팅 동의 (선택) */}
          {/* <ConsentItem
            label="마케팅 정보 수신"
            required={false}
            checked={consents.marketing}
            onCheckedChange={(v) => setConsents({ ...consents, marketing: v })}
          /> */}
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={!allRequiredChecked || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isSubmitting ? "처리 중..." : "동의하고 시작하기"}
        </Button>
      </div>

      {/* 약관 전문 보기 모달 */}
      <ConsentDocumentModal
        type={viewingDoc}
        onClose={() => setViewingDoc(null)}
      />
    </div>
  );
}

function ConsentItem({
  icon,
  label,
  required,
  checked,
  onCheckedChange,
  onViewClick,
}: {
  icon?: React.ReactNode;
  label: string;
  required: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onViewClick?: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 border border-white/10 rounded-lg bg-white/5">
      <label className="flex items-center gap-3 cursor-pointer flex-1">
        <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
        <span className="flex items-center gap-2 text-slate-300">
          {icon}
          <span>
            {required && <span className="text-rose-400">[필수] </span>}
            {!required && <span className="text-slate-500">[선택] </span>}
            {label}
          </span>
        </span>
      </label>
      {onViewClick && (
        <Button variant="ghost" size="sm" onClick={onViewClick}>
          보기
        </Button>
      )}
    </div>
  );
}

function ConsentDocumentModal({
  type,
  onClose,
}: {
  type: string | null;
  onClose: () => void;
}) {
  const titles: Record<string, string> = {
    terms: "서비스 이용약관",
    privacy: "개인정보 처리방침",
    thirdParty: "제3자 개인정보 처리 보증 약관",
  };

  return (
    <Dialog open={!!type} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{type && titles[type]}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          {type === "thirdParty" && <ThirdPartyGuaranteeContent />}
          {type === "terms" && <TermsOfServiceContent />}
          {type === "privacy" && <PrivacyPolicyContent />}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ThirdPartyGuaranteeContent() {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <h3>제3자 개인정보 처리 보증 약관</h3>
      <p><strong>시행일:</strong> 2025년 1월 1일</p>
      <h4>제1조 (목적)</h4>
      <p>본 약관은 HR Screener 서비스를 이용하여 제3자의 개인정보가 포함된 이력서를 처리하는 과정에서 사용자의 책임과 의무를 명확히 합니다.</p>
      <h4>제2조 (사용자의 보증)</h4>
      <p>사용자는 업로드하는 이력서에 대해 정보주체로부터 개인정보 수집·이용 동의를 받았음을 보증합니다.</p>
      <h4>제3조 (사용자의 책임)</h4>
      <p>본 약관 위반으로 발생하는 모든 법적 책임은 사용자에게 있습니다.</p>
    </div>
  );
}

function TermsOfServiceContent() {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <h3>서비스 이용약관</h3>
      <p><strong>시행일:</strong> 2025년 1월 1일</p>
      <p>HR Screener 서비스 이용약관입니다.</p>
    </div>
  );
}

function PrivacyPolicyContent() {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <h3>개인정보 처리방침</h3>
      <p><strong>시행일:</strong> 2025년 1월 1일</p>
      <p>HR Screener 개인정보 처리방침입니다.</p>
    </div>
  );
}

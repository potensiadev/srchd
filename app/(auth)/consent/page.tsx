"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, FileText, Shield, Users } from "lucide-react";

// 약관 버전 관리
const CONSENT_VERSIONS = {
  terms: "2025.01.01",
  privacy: "2025.01.01",
  thirdParty: "2025.01.01",
};

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

    try {
      // TODO: Supabase 연동 시 동의 저장 로직 추가
      console.log("Consents submitted:", consents);
      router.push("/dashboard");
    } catch (error) {
      console.error("Consent submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <Shield className="w-12 h-12 mx-auto text-primary" />
        <h1 className="text-2xl font-bold text-white">서비스 이용 동의</h1>
        <p className="text-slate-400 text-sm">
          HR Screener 서비스 이용을 위해 아래 약관에 동의해주세요.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-[#0F0F24]/60 backdrop-blur-md border border-white/5 space-y-4">
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
            icon={<FileText className="w-5 h-5" />}
            label="서비스 이용약관"
            required
            checked={consents.terms}
            onCheckedChange={(v) => setConsents({ ...consents, terms: v })}
            onViewClick={() => setViewingDoc("terms")}
          />

          {/* 개인정보처리방침 */}
          <ConsentItem
            icon={<Shield className="w-5 h-5" />}
            label="개인정보 처리방침"
            required
            checked={consents.privacy}
            onCheckedChange={(v) => setConsents({ ...consents, privacy: v })}
            onViewClick={() => setViewingDoc("privacy")}
          />

          {/* 제3자 정보 보증 (핵심) */}
          <div className="border-2 border-primary/30 rounded-lg p-4 space-y-3">
            <ConsentItem
              icon={<Users className="w-5 h-5" />}
              label="제3자 개인정보 처리 보증"
              required
              checked={consents.thirdParty}
              onCheckedChange={(v) => setConsents({ ...consents, thirdParty: v })}
              onViewClick={() => setViewingDoc("thirdParty")}
            />

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 text-sm">
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-amber-200">
                  <p className="font-medium">중요 안내</p>
                  <p className="mt-1 text-amber-300/80">
                    본인은 서비스에 업로드하는 이력서의 정보주체(후보자)로부터
                    <strong className="text-amber-200"> 개인정보 수집·이용에 대한 적법한 동의</strong>를 받았음을
                    보증합니다.
                  </p>
                  <p className="mt-1 text-amber-400/80 text-xs">
                    이를 위반하여 발생하는 법적 책임은 사용자 본인에게 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 마케팅 동의 (선택) */}
          <ConsentItem
            icon={<FileText className="w-5 h-5" />}
            label="마케팅 정보 수신"
            required={false}
            checked={consents.marketing}
            onCheckedChange={(v) => setConsents({ ...consents, marketing: v })}
          />
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={!allRequiredChecked || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? "처리 중..." : "동의하고 시작하기"}
        </Button>

        <p className="text-xs text-center text-slate-500">
          필수 항목에 동의하지 않으면 서비스 이용이 제한됩니다.
        </p>
      </div>

      {/* 약관 전문 보기 모달 */}
      <ConsentDocumentModal
        type={viewingDoc}
        onClose={() => setViewingDoc(null)}
      />
    </div>
  );
}

// 개별 동의 항목 컴포넌트
function ConsentItem({
  icon,
  label,
  required,
  checked,
  onCheckedChange,
  onViewClick,
}: {
  icon: React.ReactNode;
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
            {required && <span className="text-risk">[필수] </span>}
            {!required && <span className="text-slate-500">[선택] </span>}
            {label}
          </span>
        </span>
      </label>
      {onViewClick && (
        <Button variant="ghost" size="sm" onClick={onViewClick}>
          전문 보기
        </Button>
      )}
    </div>
  );
}

// 약관 전문 모달
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

// 제3자 정보 보증 약관 내용
function ThirdPartyGuaranteeContent() {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <h3>제3자 개인정보 처리 보증 약관</h3>

      <p><strong>시행일:</strong> 2025년 1월 1일</p>

      <h4>제1조 (목적)</h4>
      <p>
        본 약관은 HR Screener 서비스(이하 "서비스")를 이용하여 제3자(채용 후보자)의
        개인정보가 포함된 이력서를 업로드하고 처리하는 과정에서 사용자의 책임과
        의무를 명확히 하기 위함입니다.
      </p>

      <h4>제2조 (사용자의 보증)</h4>
      <p>사용자는 다음 사항을 보증합니다:</p>
      <ol>
        <li>
          서비스에 업로드하는 모든 이력서에 대해, 해당 정보주체(후보자)로부터
          개인정보 수집·이용에 대한 <strong>명시적인 동의</strong>를 받았습니다.
        </li>
        <li>
          정보주체에게 개인정보의 수집 목적, 항목, 보유 기간 등
          개인정보보호법에서 요구하는 사항을 고지하였습니다.
        </li>
        <li>
          정보주체는 자신의 개인정보가 AI 기반 분석 및 데이터베이스화되는 것에
          동의하였습니다.
        </li>
      </ol>

      <h4>제3조 (사용자의 책임)</h4>
      <p>
        사용자가 본 약관의 보증 사항을 위반하여 발생하는 모든 법적 분쟁, 손해배상,
        과태료, 행정처분 등에 대한 책임은 전적으로 사용자에게 있으며, 회사는 이에
        대해 책임을 지지 않습니다.
      </p>

      <h4>제4조 (회사의 역할)</h4>
      <p>회사는 다음과 같이 개인정보를 보호합니다:</p>
      <ul>
        <li>업로드된 이력서는 사용자 본인만 접근할 수 있습니다.</li>
        <li>민감한 연락처 정보는 AES-256 암호화하여 저장합니다.</li>
        <li>회사 직원도 암호화된 개인정보 원문에 접근할 수 없습니다.</li>
      </ul>

      <h4>제5조 (동의 철회 요청 처리)</h4>
      <p>
        정보주체로부터 개인정보 삭제 요청을 받은 경우, 사용자는 즉시 해당
        후보자의 정보를 서비스에서 삭제해야 합니다.
      </p>
    </div>
  );
}

// 이용약관
function TermsOfServiceContent() {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <h3>서비스 이용약관</h3>
      <p><strong>시행일:</strong> 2025년 1월 1일</p>

      <h4>제1조 (목적)</h4>
      <p>
        본 약관은 HR Screener(이하 "서비스")가 제공하는 모든 서비스의 이용조건 및
        절차, 회사와 회원간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
      </p>

      <h4>제2조 (서비스의 내용)</h4>
      <p>서비스는 다음의 기능을 제공합니다:</p>
      <ul>
        <li>이력서 파일 업로드 및 AI 기반 정보 추출</li>
        <li>후보자 데이터베이스 관리</li>
        <li>하이브리드 검색 (RDB + Vector)</li>
        <li>블라인드 이력서 생성</li>
      </ul>

      <h4>제3조 (요금 및 결제)</h4>
      <p>
        서비스는 크레딧 기반으로 운영되며, 파일 1건 처리 시 1크레딧이 차감됩니다.
        요금제별 상세 내용은 서비스 내 안내를 참고하시기 바랍니다.
      </p>
    </div>
  );
}

// 개인정보처리방침
function PrivacyPolicyContent() {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <h3>개인정보 처리방침</h3>
      <p><strong>시행일:</strong> 2025년 1월 1일</p>

      <h4>제1조 (수집하는 개인정보)</h4>
      <p>서비스는 다음의 개인정보를 수집합니다:</p>
      <ul>
        <li>회원정보: 이메일, 이름, 비밀번호(암호화)</li>
        <li>결제정보: 결제 수단 정보 (PG사 위탁)</li>
        <li>서비스 이용기록: 접속 로그, 처리 내역</li>
      </ul>

      <h4>제2조 (개인정보의 처리 목적)</h4>
      <ul>
        <li>서비스 제공 및 회원 관리</li>
        <li>요금 결제 및 정산</li>
        <li>서비스 개선 및 통계 분석</li>
      </ul>

      <h4>제3조 (개인정보의 보유 기간)</h4>
      <p>
        회원 탈퇴 시 개인정보는 즉시 파기됩니다. 단, 관련 법령에 따라
        일정 기간 보관이 필요한 정보는 해당 기간 동안 보관됩니다.
      </p>

      <h4>제4조 (개인정보의 암호화)</h4>
      <p>
        민감한 개인정보(연락처, 이메일 등)는 AES-256-GCM 방식으로 암호화하여
        저장합니다. 암호화 키는 분리 관리되며, 회사 직원도 원문에 접근할 수 없습니다.
      </p>
    </div>
  );
}

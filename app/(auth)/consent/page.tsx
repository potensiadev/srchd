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

      // 먼저 users 테이블에 레코드가 있는지 확인하고, 없으면 생성
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingUser } = await (supabase as any)
        .from("users")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!existingUser) {
        // users 테이블에 레코드 생성 (기본 필드만 사용)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: createUserError } = await (supabase as any)
          .from("users")
          .insert({
            id: user.id,
            email: user.email,
          });

        if (createUserError) {
          console.error("users insert error:", createUserError);
          throw new Error(`사용자 생성 실패: ${createUserError.message || createUserError.code || JSON.stringify(createUserError)}`);
        }
      }

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

      if (consentError) {
        console.error("user_consents insert error:", consentError);
        throw new Error(`동의 저장 실패: ${consentError.message || consentError.code || JSON.stringify(consentError)}`);
      }

      // 사용자 프로필 업데이트
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: userError } = await (supabase as any)
        .from("users")
        .update({
          consents_completed: true,
          consents_completed_at: now,
        })
        .eq("id", user.id);

      if (userError) {
        console.error("users update error:", userError);
        throw new Error(`프로필 업데이트 실패: ${userError.message || userError.code || JSON.stringify(userError)}`);
      }

      router.push("/candidates");
      router.refresh();
    } catch (err: unknown) {
      console.error("Consent error:", err);
      const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);

      // 이미 동의한 경우 (중복)
      if (errorMessage.includes("duplicate") || errorMessage.includes("unique") || errorMessage.includes("already exists") || errorMessage.includes("23505")) {
        router.push("/candidates");
        router.refresh();
        return;
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 mb-6">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">서비스 이용 동의</h1>
        <p className="text-gray-500 text-sm">
          서치드 서비스 이용을 위해 아래 약관에 동의해주세요.
        </p>
      </div>

      <div className="p-8 rounded-3xl bg-white shadow-2xl shadow-black/5 border border-gray-100 space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* 전체 동의 */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={allRequiredChecked && consents.marketing}
              onCheckedChange={handleCheckAll}
              className="border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <span className="font-semibold text-gray-900">모두 동의합니다</span>
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
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div className="text-amber-900">
                <p className="font-semibold">중요 안내</p>
                <p className="mt-1 text-amber-700 leading-relaxed">
                  업로드하는 이력서의 정보주체(후보자)로부터 개인정보 수집·이용 동의를 받았음을 보증합니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        <Button
          className="w-full h-12 text-base font-semibold rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
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

      <div className="text-center">
        <a
          href="/api/auth/signout"
          className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-4"
        >
          다른 계정으로 로그인하기
        </a>
      </div>
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
    <div className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
      <label className="flex items-center gap-3 cursor-pointer flex-1">
        <Checkbox
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
        />
        <span className="flex items-center gap-2 text-gray-600">
          {icon}
          <span>
            {required && <span className="text-rose-500 font-medium">[필수] </span>}
            {!required && <span className="text-gray-400 font-medium">[선택] </span>}
            <span className={required ? "text-gray-900" : "text-gray-600"}>{label}</span>
          </span>
        </span>
      </label>
      {onViewClick && (
        <Button variant="ghost" size="sm" onClick={onViewClick} className="text-gray-400 hover:text-gray-900 hover:bg-gray-100">
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
      <DialogContent className="max-w-2xl max-h-[80vh] bg-white border-gray-100 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900">{type && titles[type]}</DialogTitle>
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
    <div className="prose prose-sm max-w-none text-gray-600">
      <h3 className="text-gray-900">제3자 개인정보 처리 위탁 및 보안 보증</h3>
      <p><strong>최종 수정일:</strong> 2026년 1월 18일</p>
      <p>본 문서는 포텐시아 주식회사(이하 &quot;수탁자&quot;)가 회원(이하 &quot;위탁자&quot;)으로부터 위탁받은 개인정보(후보자 데이터)를 처리함에 있어 준수해야 할 사항을 규정합니다.</p>

      <h4 className="text-gray-800">제1조 (목적)</h4>
      <p>본 계약은 위탁자가 수탁자에게 채용 후보자 정보 관리 및 AI 분석 업무를 위탁함에 있어, 수탁자가 준수해야 할 「개인정보 보호법」 상의 책임과 의무를 정함을 목적으로 합니다.</p>

      <h4 className="text-gray-800">제2조 (위탁 업무의 내용)</h4>
      <p>1. 이력서 및 후보자 정보의 전산 등록, 저장, 검색 서비스 제공.<br />
        2. AI 기술을 활용한 이력서 파싱, 요약, 직무 적합도 분석.<br />
        3. 블라인드 프로필(비식별화 문서) 생성 및 송부 기능 제공.</p>

      <h4 className="text-gray-800">제3조 (재위탁의 제한)</h4>
      <p>수탁자는 서비스 제공을 위해 필요한 클라우드 인프라(Supabase, AWS 등) 및 AI 엔진(OpenAI) 활용을 제외하고는, 위탁자의 사전 승낙 없이 제3자에게 개인정보 처리를 재위탁하지 않습니다.</p>

      <h4 className="text-gray-800">제4조 (안전성 확보 조치)</h4>
      <p>수탁자는 다음의 조치를 이행하여 위탁받은 개인정보를 안전하게 관리합니다.<br />
        1. 데이터 격리: 회원별 고유 ID를 기반으로 데이터 접근 권한을 엄격히 분리(Row Level Security)하여, 타 회원이 위탁자의 데이터에 접근할 수 없도록 합니다.<br />
        2. 암호화: 주요 식별 정보는 표준 암호화 알고리즘을 사용하여 저장합니다.<br />
        3. 접근 기록: 시스템 접속 및 처리 기록을 최소 1년 이상 보관 및 점검합니다.</p>

      <h4 className="text-gray-800">제5조 (사고 통지 및 손해배상)</h4>
      <p>1. 수탁자는 개인정보 유출 사고가 발생한 경우 지체 없이 위탁자에게 통지하고 피해 최소화 조치를 취해야 합니다.<br />
        2. 수탁자의 고의 또는 과실로 인하여 위탁자 또는 정보주체에게 손해가 발생한 경우, 수탁자는 그 손해를 배상할 책임이 있습니다.</p>

      <h4 className="text-gray-800">제6조 (관리 및 감독)</h4>
      <p>위탁자는 수탁자의 개인정보 처리 현황에 대해 관리·감독할 권리가 있으며, 수탁자는 이에 성실히 협조합니다.</p>
    </div>
  );
}

function TermsOfServiceContent() {
  return (
    <div className="prose prose-sm max-w-none text-gray-600">
      <h3 className="text-gray-900">서비스 이용약관</h3>
      <p><strong>최종 수정일:</strong> 2026년 1월 18일</p>

      <h4 className="text-gray-800">제1장 총칙</h4>

      <h5 className="text-gray-800">제1조 (목적)</h5>
      <p>본 약관은 포텐시아 주식회사(이하 &quot;회사&quot;)가 제공하는 서치드(Srchd) 서비스(이하 &quot;서비스&quot;)의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.</p>

      <h5 className="text-gray-800">제2조 (용어의 정의)</h5>
      <p>1. 서비스: 회사가 웹사이트를 통해 제공하는 AI 기반 이력서 분석, 인재 매칭, 이력서 관리 및 이에 부수하는 제반 서비스를 의미합니다.<br />
        2. 회원: 본 약관에 동의하고 회사가 승인하여 서비스를 이용하는 개인 또는 기업을 의미합니다.<br />
        3. 후보자(Candidate): 회원이 서비스에 정보를 등록하여 관리하거나 분석을 의뢰하는 구직자 또는 잠재적 인재를 의미합니다.<br />
        4. 크레딧(Credit): 서비스 내 유료 기능(이력서 업로드, 분석, 블라인드 처리 등)을 이용하기 위해 사용되는 가상의 재화를 의미합니다.<br />
        5. 구독(Subscription): 정해진 기간 동안 서비스의 특정 기능을 이용할 수 있는 유료 요금제를 의미합니다.</p>

      <h5 className="text-gray-800">제3조 (약관의 게시와 개정)</h5>
      <p>1. 회사는 본 약관의 내용을 회원이 쉽게 알 수 있도록 서비스 초기 화면 또는 연결 화면에 게시합니다.<br />
        2. 회사는 「약관의 규제에 관한 법률」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있습니다.<br />
        3. 회사가 약관을 개정할 경우에는 적용일자 및 개정사유를 명시하여 현행약관과 함께 서비스 내에 공지합니다.</p>

      <h4 className="text-gray-800">제2장 서비스 이용계약</h4>

      <h5 className="text-gray-800">제4조 (이용계약의 체결)</h5>
      <p>1. 이용계약은 회원이 되고자 하는 자(이하 &quot;가입신청자&quot;)가 약관의 내용에 대하여 동의를 한 다음 회원가입 신청을 하고 회사가 이를 승낙함으로써 체결됩니다.<br />
        2. 회사는 가입신청자의 신청에 대하여 서비스 이용을 승낙함을 원칙으로 합니다. 다만, 적법하지 않은 용도(개인정보 매매 등)로 사용하려는 것이 확인되거나 기술상 지장이 있는 경우에는 승낙을 유보하거나 거절할 수 있습니다.</p>

      <h5 className="text-gray-800">제5조 (개인정보보호 의무)</h5>
      <p>회사는 관련 법령이 정하는 바에 따라 회원의 개인정보를 보호하기 위해 노력하며, 개인정보의 보호 및 사용에 대해서는 관련 법령 및 회사의 개인정보 처리방침이 적용됩니다.</p>

      <h4 className="text-gray-800">제3장 서비스 이용 및 유료 서비스</h4>

      <h5 className="text-gray-800">제6조 (서비스의 제공)</h5>
      <p>1. 회사는 다음과 같은 서비스를 제공합니다.<br />
        - 이력서(PDF, Word 등) 자동 파싱 및 DB화<br />
        - AI 기반 인재 추천 및 적합도 분석 (Matching & FIT Scoring)<br />
        - 이력서 내 민감정보 비식별화(Blind) 및 제안용 프로필 생성<br />
        - 채용 공고(JD) 분석 및 요약<br />
        - 기타 채용 업무 효율화를 위한 제반 기능<br />
        2. 회사는 AI 분석 결과의 완전성이나 정확성을 보증하지 않으며, 해당 정보는 회원의 채용 의사결정을 보조하는 참고 자료로만 활용되어야 합니다.</p>

      <h5 className="text-gray-800">제7조 (유료 서비스 및 결제)</h5>
      <p>1. 서비스의 일부 기능은 유료(구독 또는 크레딧 차감)로 제공됩니다.<br />
        2. 결제는 회사가 지정한 결제 대행사(Paddle 등)를 통해 이루어집니다.<br />
        3. 회원은 결제와 관련하여 결제 대행사의 약관에 동의해야 합니다.</p>

      <h5 className="text-gray-800">제8조 (청약철회 및 환불)</h5>
      <p>1. 구독 취소: 회원은 언제든지 구독을 해지할 수 있으며, 해지 시 다음 결제 주기부터 과금되지 않습니다. 잔여 기간에 대한 일할 계산 환불은 원칙적으로 제공되지 않습니다.<br />
        2. 품질 보증 환불 (Quality Refund): 회사의 AI 분석 결과가 현저히 품질 미달(예: 신뢰도 점수 기준치 미달, 내용 오류 등)인 경우, 시스템 정책에 따라 크레딧이 자동으로 환불될 수 있습니다.<br />
        3. 기타 환불: 회사의 귀책사유로 서비스를 정상적으로 이용하지 못한 경우, 회사는 합리적인 범위 내에서 보상 또는 환불 조치합니다. 단, 회원의 단순 변심에 의한 기사용 서비스 환불은 불가합니다.</p>

      <h4 className="text-gray-800">제4장 의무 및 책임</h4>

      <h5 className="text-gray-800">제9조 (회원의 의무)</h5>
      <p>1. 회원은 서비스 이용 시 관계 법령, 본 약관, 공지사항 등을 준수해야 합니다.<br />
        2. 회원은 자신이 등록하는 후보자(Candidate)의 개인정보를 「개인정보 보호법」 등 관련 법령에 따라 적법하게 수집 및 이용해야 할 책임이 있습니다. 회사가 제공하는 서비스는 회원이 수집한 정보를 효율적으로 관리하는 도구일 뿐, 정보 수집의 적법성을 담보하지 않습니다.<br />
        3. 회원은 서비스 계정 및 API Key, 비밀번호 관리에 대한 책임을 지며, 이를 제3자에게 공유하여 발생한 문제에 대한 책임은 회원에게 있습니다.</p>

      <h5 className="text-gray-800">제10조 (면책 조항)</h5>
      <p>1. 회사는 천재지변, 디도스(DDoS) 공격, 클라우드 공급자(AWS, Supabase 등)의 장애 등 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 책임이 면제됩니다.<br />
        2. 회사는 회원이 서비스에 입력하거나 생성한 데이터의 신뢰도, 정확성 등에 관하여는 책임을 지지 않습니다.<br />
        3. AI 분석 결과는 확률에 기반한 예측치이므로, 이를 토대로 한 채용 결과(합격/불합격 등)에 대해 회사는 일체의 책임을 지지 않습니다.</p>

      <h4 className="text-gray-800">제5장 기타</h4>

      <h5 className="text-gray-800">제11조 (분쟁의 해결 및 관할법원)</h5>
      <p>본 약관과 관련하여 회사와 회원 간에 발생한 분쟁에 대해서는 대한민국 법을 준거법으로 하며, 서울중앙지방법원을 제1심 관할법원으로 합니다.</p>
    </div>
  );
}

function PrivacyPolicyContent() {
  return (
    <div className="prose prose-sm max-w-none text-gray-600">
      <h3 className="text-gray-900">개인정보 처리방침</h3>
      <p><strong>최종 수정일:</strong> 2026년 1월 18일</p>
      <p>포텐시아 주식회사(이하 &quot;회사&quot;)는 「개인정보 보호법」 등 관련 법령을 준수하며, 정보주체의 권익을 보호하기 위해 다음과 같은 개인정보 처리방침을 수립·공개합니다.</p>

      <h4 className="text-gray-800">제1조 (개인정보의 처리 목적)</h4>
      <p>회사는 다음의 목적을 위해 개인정보를 처리합니다.<br />
        1. 회원 가입 및 관리: 서비스 이용에 따른 본인 식별, 가입 의사 확인, 고객 상담, 서비스 부정 이용 방지.<br />
        2. 서비스 제공 및 요금 정산: 인재 검색 및 관리, 이력서 파싱, AI 매칭 분석, 유료 결제 및 정산.<br />
        3. 서비스 개선: AI 알고리즘 고도화, 신규 기능 개발, 서비스 이용 통계 분석.</p>

      <h4 className="text-gray-800">제2조 (수집하는 개인정보의 항목)</h4>
      <p>회사는 서비스 제공을 위해 아래와 같은 정보를 수집·처리합니다.</p>
      <p><strong>(1) 회원 정보 (채용 담당자/헤드헌터)</strong><br />
        - 필수항목: 이름, 이메일 주소, 비밀번호(암호화), 소속 회사/기관명.<br />
        - 결제정보: 카드 정보(결제 대행사 위탁 처리), 결제 기록.<br />
        - 자동수집: 접속 로그, 쿠키, IP 주소, 이용 기록.</p>
      <p><strong>(2) 위탁받아 처리하는 정보 (후보자 정보)</strong><br />
        회원은 위탁자로서 적법한 절차에 따라 수집한 아래 정보를 시스템에 등록하며, 회사는 수탁자로서 이를 처리합니다.<br />
        - 식별 정보: 이름, 연락처(전화번호, 이메일).<br />
        - 경력 정보: 근무 경력, 직무, 직급, 학력, 보유 기술(Skill), 자격증.<br />
        - 문서 정보: 이력서 파일(PDF, Word 등) 및 포함된 텍스트 데이터.<br />
        - 분석 정보: AI가 생성한 요약문, 매칭 점수, 역량 분석 결과 등.</p>

      <h4 className="text-gray-800">제3조 (개인정보의 처리 및 보유 기간)</h4>
      <p>1. 회원 정보: 회원 탈퇴 시까지 보유 및 이용합니다. 단, 관계 법령(전자상거래법 등)에 따라 일정 기간 보존이 필요한 경우 해당 기간까지 보관합니다.<br />
        2. 후보자 정보: 회원이 삭제를 요청하거나 위탁 계약(서비스 이용)이 종료될 때까지 보유합니다. 회원이 &apos;삭제&apos; 기능을 수행할 경우, 데이터는 지체 없이 파기되거나 복구 불가능한 식별 불가 상태로 전환됩니다.</p>

      <h4 className="text-gray-800">제4조 (개인정보의 제3자 제공 및 처리 위탁)</h4>
      <p>회사는 서비스 제공을 위해 전문 업체에 일부 업무를 위탁하고 있습니다.</p>
      <ul className="list-disc pl-5">
        <li><strong>Supabase Inc.</strong>: 데이터베이스 호스팅 및 인증 관리</li>
        <li><strong>Vercel Inc.</strong>: 웹 어플리케이션 호스팅</li>
        <li><strong>OpenAI LLC</strong>: 이력서 텍스트 분석 및 AI 처리</li>
        <li><strong>Paddle.com</strong>: 결제 대행 및 구독 관리</li>
      </ul>
      <p>*위탁 업체는 회사의 엄격한 개인정보보호 규정을 준수하며, 서비스 제공 목적 외에는 정보를 이용하지 않습니다.</p>

      <h4 className="text-gray-800">제5조 (개인정보의 파기)</h4>
      <p>1. 파기절차: 보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 내부 방침 및 관련 법령에 따라 파기합니다.<br />
        2. 파기방법: 전자적 파일 형태는 복구할 수 없는 기술적 방법을 사용하여 영구 삭제하며, 출력물은 분쇄하거나 소각합니다.</p>

      <h4 className="text-gray-800">제6조 (정보주체의 권리)</h4>
      <p>1. 회원은 언제든지 자신의 개인정보를 조회·수정하거나 회원 탈퇴를 요청할 수 있습니다.<br />
        2. 회원이 등록한 후보자 정보의 실제 정보주체가 열람, 정정, 삭제를 요구하는 경우, 회원은 서비스 내 기능을 통해 이를 직접 처리하거나 회사에 처리를 요청할 수 있습니다.</p>

      <h4 className="text-gray-800">제7조 (개인정보의 안전성 확보 조치)</h4>
      <p>1. DB 암호화: 민감한 개인정보(연락처 등)는 암호화되어 저장됩니다.<br />
        2. 접근 통제: 데이터 베이스에 대한 접근 권한을 최소화하고, Row Level Security(RLS)를 통해 회원 간 데이터가 철저히 분리됩니다.<br />
        3. 전송 구간 암호화: 모든 데이터 통신은 SSL/TLS 보안 프로토콜을 통해 전송됩니다.</p>

      <h4 className="text-gray-800">제8조 (개인정보 보호책임자)</h4>
      <p>- 담당 부서: 운영팀<br />
        - 이메일: privacy@potensia.inc</p>
    </div>
  );
}

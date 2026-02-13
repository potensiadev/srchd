"use client";

import { motion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { useState, useEffect, useSyncExternalStore } from "react";

// Table of Contents
const tocItems = [
  { id: "general", label: "제1조 (목적)" },
  { id: "definitions", label: "제2조 (정의)" },
  { id: "terms-effect", label: "제3조 (약관의 효력)" },
  { id: "registration", label: "제4조 (이용계약 체결)" },
  { id: "service-description", label: "제5조 (서비스 내용)" },
  { id: "fees", label: "제6조 (요금 및 결제)" },
  { id: "user-obligations", label: "제7조 (이용자의 의무)" },
  { id: "prohibited", label: "제8조 (금지행위)" },
  { id: "intellectual-property", label: "제9조 (지적재산권)" },
  { id: "privacy", label: "제10조 (개인정보 보호)" },
  { id: "data-handling", label: "제11조 (데이터 처리)" },
  { id: "disclaimer", label: "제12조 (면책조항)" },
  { id: "limitation", label: "제13조 (책임 제한)" },
  { id: "termination", label: "제14조 (계약 해지)" },
  { id: "refund", label: "제15조 (환불 정책)" },
  { id: "dispute", label: "제16조 (분쟁 해결)" },
  { id: "changes", label: "제17조 (약관 변경)" },
  { id: "misc", label: "제18조 (기타)" },
];

// Hydration-safe subscription for SSR
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function TermsPage() {
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 500);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!mounted) return null;

  return (
    <main className="pt-32 pb-20 px-6">
      {/* Hero */}
      <div className="max-w-4xl mx-auto text-center mb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-6">
            서비스 이용약관
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed">
            서치드 서비스 이용에 관한 약관입니다.
          </p>
          <p className="text-sm text-gray-400 mt-4">
            최종 수정일: 2025년 1월 13일 | 시행일: 2025년 1월 13일
          </p>
        </motion.div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-12">
        {/* TOC - Desktop */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-32 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm max-h-[calc(100vh-160px)] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">목차</h3>
            <nav className="space-y-1">
              {tocItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block text-sm text-gray-500 hover:text-primary transition-colors py-1.5 border-l-2 border-transparent hover:border-primary pl-3 -ml-px"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex-1 min-w-0"
        >
          <div className="p-8 md:p-12 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-12">
            <section id="general" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제1조 (목적)</h2>
              <p className="text-gray-600 leading-relaxed">
                본 약관은 포텐시아 주식회사(이하 &quot;회사&quot;)가 제공하는 AI 기반 이력서 분석 서비스
                &quot;서치드&quot;(이하 &quot;서비스&quot;)의 이용에 관한 회사와 이용자 간의 권리, 의무 및
                책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
              </p>
            </section>

            <section id="definitions" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제2조 (정의)</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                본 약관에서 사용하는 용어의 정의는 다음과 같습니다.
              </p>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  <strong className="text-gray-900">&quot;서비스&quot;</strong>란 회사가 제공하는 AI 기반 이력서
                  자동 분석, 후보자 검색, 데이터 관리 등의 채용 지원 서비스를 말합니다.
                </li>
                <li>
                  <strong className="text-gray-900">&quot;이용자&quot;</strong>란 본 약관에 동의하고 회사와
                  이용계약을 체결하여 서비스를 이용하는 헤드헌터, HR 담당자 및 기업 고객을 말합니다.
                </li>
                <li>
                  <strong className="text-gray-900">&quot;후보자 데이터&quot;</strong>란 이용자가 서비스에
                  업로드하는 이력서, 경력기술서 등의 문서 및 이로부터 추출된 정보를 말합니다.
                </li>
                <li>
                  <strong className="text-gray-900">&quot;크레딧&quot;</strong>이란 서비스 이용 단위로서,
                  이력서 분석 1건당 1크레딧이 차감됩니다.
                </li>
                <li>
                  <strong className="text-gray-900">&quot;플랜&quot;</strong>이란 회사가 제공하는 서비스
                  이용 요금제(Starter, Pro, Enterprise 등)를 말합니다.
                </li>
              </ol>
            </section>

            <section id="terms-effect" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제3조 (약관의 효력 및 변경)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  본 약관은 서비스 웹사이트에 게시하거나 기타의 방법으로 이용자에게 공지함으로써
                  효력이 발생합니다.
                </li>
                <li>
                  회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 변경할 수 있으며, 변경된
                  약관은 제1항과 같은 방법으로 공지합니다.
                </li>
                <li>
                  이용자는 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 이용계약을
                  해지할 수 있습니다. 변경된 약관의 효력 발생일 이후에도 서비스를 계속 이용하는
                  경우 약관 변경에 동의한 것으로 간주합니다.
                </li>
              </ol>
            </section>

            <section id="registration" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제4조 (이용계약의 체결)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  이용계약은 이용자가 본 약관에 동의하고, 회사가 정한 가입 절차를 완료함으로써
                  체결됩니다.
                </li>
                <li>
                  회사는 다음 각 호에 해당하는 경우 이용신청을 거부하거나 사후에 이용계약을
                  해지할 수 있습니다.
                  <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-gray-500">
                    <li>실명이 아니거나 타인의 명의를 도용한 경우</li>
                    <li>허위 정보를 기재하거나 필수 정보를 기재하지 않은 경우</li>
                    <li>만 18세 미만인 경우</li>
                    <li>이전에 본 약관 위반으로 이용자격이 상실된 경우</li>
                    <li>기타 회사가 정한 이용신청 요건을 충족하지 못한 경우</li>
                  </ul>
                </li>
                <li>
                  이용자는 회원가입 시 제공한 정보에 변경이 있는 경우, 지체 없이 회사에
                  알리거나 서비스 내에서 직접 수정하여야 합니다.
                </li>
              </ol>
            </section>

            <section id="service-description" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제5조 (서비스의 내용)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  회사가 제공하는 서비스의 주요 기능은 다음과 같습니다.
                  <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-gray-500">
                    <li>AI 기반 이력서 자동 분석 (2-Way Cross-Check)</li>
                    <li>후보자 정보 추출 및 구조화</li>
                    <li>시맨틱 검색 및 필터링</li>
                    <li>블라인드 이력서 내보내기</li>
                    <li>후보자 데이터 관리 및 버전 관리</li>
                    <li>분석 신뢰도 및 리스크 평가</li>
                  </ul>
                </li>
                <li>
                  서비스는 연중무휴 24시간 제공을 원칙으로 하나, 시스템 점검, 장애 복구,
                  기타 불가피한 사유가 있는 경우 일시적으로 중단될 수 있습니다.
                </li>
                <li>
                  회사는 서비스의 품질 향상을 위해 사전 공지 후 서비스의 전부 또는 일부를
                  변경할 수 있습니다.
                </li>
              </ol>
            </section>

            <section id="fees" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제6조 (요금 및 결제)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  서비스 이용요금은 회사가 정한 플랜에 따르며, 요금 정책은 서비스 웹사이트에
                  공지합니다.
                </li>
                <li>
                  유료 플랜의 결제는 신용카드, 계좌이체 등 회사가 지정한 결제수단을 통해
                  이루어집니다.
                </li>
                <li>
                  월간 구독 요금은 매월 결제일에 자동으로 청구되며, 이용자는 다음 결제일 전에
                  구독을 취소할 수 있습니다.
                </li>
                <li>
                  플랜별 제공 크레딧은 해당 결제 주기 내에만 유효하며, 미사용 크레딧은
                  다음 주기로 이월되지 않습니다.
                </li>
                <li>
                  회사는 요금 정책을 변경할 수 있으며, 변경 시 최소 30일 전에 이용자에게
                  통지합니다.
                </li>
              </ol>
            </section>

            <section id="user-obligations" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제7조 (이용자의 의무)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  이용자는 서비스 이용 시 관련 법령, 본 약관의 규정, 이용안내 및 서비스와
                  관련하여 공지한 주의사항을 준수하여야 합니다.
                </li>
                <li>
                  이용자는 후보자 데이터의 적법한 수집 및 이용에 대한 책임을 부담하며,
                  개인정보보호법 등 관련 법령을 준수하여야 합니다.
                </li>
                <li>
                  이용자는 계정 정보(이메일, 비밀번호 등)를 안전하게 관리하여야 하며,
                  이를 제3자에게 양도하거나 대여할 수 없습니다.
                </li>
                <li>
                  이용자는 서비스 이용 중 알게 된 타인의 개인정보를 본래의 목적 외의
                  용도로 사용하거나 제3자에게 제공할 수 없습니다.
                </li>
              </ol>
            </section>

            <section id="prohibited" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제8조 (금지행위)</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                이용자는 다음 각 호의 행위를 하여서는 안 됩니다.
              </p>
              <ol className="list-decimal list-inside space-y-2 text-gray-600">
                <li>타인의 개인정보를 도용하거나 부정하게 사용하는 행위</li>
                <li>서비스를 이용하여 얻은 정보를 회사의 사전 승낙 없이 영리 목적으로 이용하거나 제3자에게 제공하는 행위</li>
                <li>회사의 지적재산권, 제3자의 지적재산권 등 기타 권리를 침해하는 행위</li>
                <li>회사의 서버에 해킹, 악성코드 유포 등을 통해 서비스 운영을 방해하는 행위</li>
                <li>자동화된 수단(봇, 크롤러 등)을 이용하여 서비스에 접근하거나 데이터를 수집하는 행위</li>
                <li>리버스 엔지니어링, 디컴파일, 역어셈블 등 서비스 분석 행위</li>
                <li>다량의 정보를 전송하거나 광고성 정보를 전송하는 행위</li>
                <li>기타 관련 법령이나 사회 상규에 어긋나는 행위</li>
              </ol>
            </section>

            <section id="intellectual-property" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제9조 (지적재산권)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  서비스에 관한 저작권, 특허권, 상표권, 영업비밀 등 지적재산권은 회사에
                  귀속됩니다.
                </li>
                <li>
                  이용자가 서비스에 업로드한 후보자 데이터에 대한 소유권은 이용자에게
                  귀속됩니다. 단, 회사는 서비스 제공 및 개선을 위해 해당 데이터를
                  처리(분석, 저장 등)할 수 있습니다.
                </li>
                <li>
                  이용자는 회사가 제공하는 서비스를 이용함으로써 얻은 정보를 회사의
                  사전 승낙 없이 복제, 송신, 출판, 배포, 방송 기타 방법에 의하여
                  영리 목적으로 이용하거나 제3자에게 이용하게 할 수 없습니다.
                </li>
              </ol>
            </section>

            <section id="privacy" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제10조 (개인정보 보호)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  회사는 이용자의 개인정보를 보호하기 위해 개인정보보호법 등 관련 법령이
                  정하는 바를 준수합니다.
                </li>
                <li>
                  개인정보의 수집, 이용, 제공에 관한 사항은 별도의 개인정보처리방침에
                  따릅니다.
                </li>
                <li>
                  회사는 이용자의 동의 없이 이용자의 개인정보를 제3자에게 제공하지
                  않습니다. 다만, 법령에 의해 요구되는 경우는 예외로 합니다.
                </li>
                <li>
                  이용자가 업로드하는 후보자 데이터에 포함된 개인정보의 적법한 처리에
                  대한 책임은 이용자에게 있습니다.
                </li>
              </ol>
            </section>

            <section id="data-handling" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제11조 (데이터 처리)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  회사는 이용자가 업로드한 후보자 데이터를 AES-256-GCM 암호화 방식으로
                  안전하게 저장합니다.
                </li>
                <li>
                  이용자의 데이터는 Row Level Security(RLS)를 통해 다른 이용자의
                  데이터와 완전히 격리됩니다.
                </li>
                <li>
                  회사는 이용계약이 종료된 후 관련 법령에서 정한 기간 동안 데이터를
                  보관하며, 이후 안전하게 삭제합니다.
                </li>
                <li>
                  이용자는 언제든지 자신이 업로드한 데이터의 삭제를 요청할 수 있으며,
                  회사는 관련 법령에서 보존을 요구하는 경우를 제외하고 지체 없이
                  해당 데이터를 삭제합니다.
                </li>
              </ol>
            </section>

            <section id="disclaimer" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제12조 (면책조항)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  회사는 천재지변, 전쟁, 기간통신사업자의 서비스 중단 등 불가항력적인
                  사유로 인해 서비스를 제공할 수 없는 경우 책임이 면제됩니다.
                </li>
                <li>
                  회사는 이용자의 귀책사유로 인한 서비스 이용 장애에 대해 책임을
                  부담하지 않습니다.
                </li>
                <li>
                  AI 분석 결과는 참고용 정보로 제공되며, 회사는 분석 결과의 정확성이나
                  완전성을 보장하지 않습니다. 최종 채용 결정은 이용자의 판단과 책임
                  하에 이루어져야 합니다.
                </li>
                <li>
                  회사는 이용자가 서비스를 통해 얻은 정보를 이용하여 발생한 손해에
                  대해 책임을 부담하지 않습니다.
                </li>
              </ol>
            </section>

            <section id="limitation" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제13조 (책임의 제한)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  회사의 서비스와 관련하여 발생하는 회사의 손해배상 책임은 이용자가
                  해당 서비스에 대해 지불한 금액을 한도로 합니다.
                </li>
                <li>
                  회사는 간접손해, 특별손해, 결과적 손해, 징벌적 손해, 영업이익 손실에
                  대해서는 책임을 부담하지 않습니다.
                </li>
                <li>
                  본 조의 책임 제한은 관련 법령이 허용하는 최대 범위 내에서 적용됩니다.
                </li>
              </ol>
            </section>

            <section id="termination" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제14조 (계약의 해지)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  이용자는 언제든지 서비스 내 설정 메뉴 또는 고객센터를 통해 이용계약
                  해지를 요청할 수 있습니다.
                </li>
                <li>
                  회사는 이용자가 본 약관을 위반한 경우 사전 통지 후 이용계약을 해지할
                  수 있습니다. 다만, 중대한 위반의 경우 즉시 해지할 수 있습니다.
                </li>
                <li>
                  이용계약이 해지된 경우 이용자의 데이터는 관련 법령에서 정한 기간 동안
                  보관 후 삭제됩니다.
                </li>
              </ol>
            </section>

            <section id="refund" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제15조 (환불 정책)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  <strong className="text-gray-900">14일 전액 환불:</strong> 결제일로부터 14일 이내에 환불을 요청하는 경우,
                  서비스 이용 여부와 관계없이 전액 환불됩니다.
                </li>
                <li>
                  <strong className="text-gray-900">환불 절차:</strong> 환불 요청은 서비스 내 설정 메뉴 또는
                  고객센터(support@rai.kr)를 통해 할 수 있으며, 요청일로부터
                  5~7영업일 이내에 원결제 수단으로 환불됩니다.
                </li>
                <li>
                  <strong className="text-gray-900">14일 경과 후:</strong> 결제일로부터 14일이 경과한 후에는
                  환불이 불가하며, 현재 결제 주기가 종료될 때까지 서비스를 계속 이용할 수 있습니다.
                </li>
                <li>
                  <strong className="text-gray-900">서비스 장애 보상:</strong> 회사의 귀책사유로 서비스가 중단된 경우,
                  별도의 보상 정책에 따라 크레딧 또는 이용 기간 연장으로 보상합니다.
                </li>
              </ol>
            </section>

            <section id="dispute" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제16조 (분쟁 해결)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  본 약관의 해석 및 회사와 이용자 간의 분쟁에 관하여는 대한민국 법령을
                  적용합니다.
                </li>
                <li>
                  서비스 이용 중 발생한 분쟁에 대해 소송이 제기되는 경우, 회사의 본사
                  소재지를 관할하는 법원을 전속 관할 법원으로 합니다.
                </li>
                <li>
                  회사와 이용자 간에 발생한 분쟁은 우선적으로 상호 협의를 통해 해결하며,
                  협의가 이루어지지 않는 경우 관련 법령에 따른 분쟁조정 절차를 이용할
                  수 있습니다.
                </li>
              </ol>
            </section>

            <section id="changes" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제17조 (약관의 변경)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  회사는 필요한 경우 본 약관을 변경할 수 있으며, 변경된 약관은 서비스
                  웹사이트에 공지합니다.
                </li>
                <li>
                  중요한 약관 변경의 경우 변경 시행일 최소 7일 전에 이용자에게 이메일
                  또는 서비스 내 알림으로 통지합니다.
                </li>
                <li>
                  이용자가 변경된 약관에 동의하지 않는 경우 이용계약을 해지할 수 있습니다.
                </li>
              </ol>
            </section>

            <section id="misc" className="scroll-mt-32">
              <h2 className="text-xl font-bold text-gray-900 mb-4">제18조 (기타)</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>
                  본 약관에서 정하지 않은 사항과 본 약관의 해석에 관하여는 관계법령 및
                  상관례에 따릅니다.
                </li>
                <li>
                  본 약관의 일부 조항이 무효화되더라도 나머지 조항의 효력에는 영향을
                  미치지 않습니다.
                </li>
                <li>
                  회사는 필요한 경우 특정 서비스에 적용되는 별도의 이용약관 또는 정책을
                  수립할 수 있으며, 이는 본 약관과 함께 적용됩니다.
                </li>
              </ol>
            </section>

            <section className="pt-8 border-t border-gray-100 mt-12">
              <h2 className="text-xl font-bold text-gray-900 mb-4">부칙</h2>
              <ol className="list-decimal list-inside space-y-2 text-gray-600">
                <li>본 약관은 2025년 1월 13일부터 시행됩니다.</li>
                <li>본 약관 시행 전에 가입한 이용자에게도 본 약관이 적용됩니다.</li>
              </ol>
            </section>

            <section className="pt-8 border-t border-gray-100 mt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">문의처</h2>
              <div className="text-gray-600 space-y-2">
                <p><strong className="text-gray-900">회사명:</strong> 포텐시아 주식회사 (Potensia Inc.)</p>
                <p><strong className="text-gray-900">이메일:</strong> support@rai.kr</p>
                <p><strong className="text-gray-900">고객센터:</strong> 평일 09:00 - 18:00</p>
              </div>
            </section>
          </div>
        </motion.div>
      </div>

      {/* Scroll to Top Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: showScrollTop ? 1 : 0 }}
        onClick={scrollToTop}
        className="fixed bottom-8 right-8 p-3 rounded-full bg-white border border-gray-200
                 text-primary hover:bg-gray-50 transition-all z-50 shadow-lg"
        style={{ pointerEvents: showScrollTop ? "auto" : "none" }}
        aria-label="맨 위로"
      >
        <ChevronUp className="w-5 h-5" />
      </motion.button>
    </main>
  );
}

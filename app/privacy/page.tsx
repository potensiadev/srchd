"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Sparkles, Menu, X, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";

// Navigation links
const navLinks = [
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
];

// Table of Contents
const tocItems = [
  { id: "general", label: "제1조 (목적)" },
  { id: "collected-items", label: "제2조 (수집 항목)" },
  { id: "purpose", label: "제3조 (이용 목적)" },
  { id: "retention", label: "제4조 (보유 기간)" },
  { id: "provision", label: "제5조 (제3자 제공)" },
  { id: "consignment", label: "제6조 (처리 위탁)" },
  { id: "destruction", label: "제7조 (파기 절차)" },
  { id: "rights", label: "제8조 (이용자 권리)" },
  { id: "safety", label: "제9조 (안전성 조치)" },
  { id: "automations", label: "제10조 (자동화된 처리)" },
  { id: "cookies", label: "제11조 (쿠키 운영)" },
  { id: "privacy-officer", label: "제12조 (책임자)" },
  { id: "changes", label: "제13조 (개정)" },
];

export default function PrivacyPage() {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 500);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/10 selection:text-primary">
      {/* Navigation */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/80 backdrop-blur-md border-b border-gray-100" : "bg-transparent"
          }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <span className="text-xl font-bold tracking-tight text-gray-900">서치드</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="px-5 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all shadow-sm hover:shadow-md"
            >
              시작하기
            </Link>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <motion.div
        initial={false}
        animate={{ height: mobileMenuOpen ? "auto" : 0, opacity: mobileMenuOpen ? 1 : 0 }}
        className="md:hidden overflow-hidden bg-white border-b border-gray-100 fixed top-20 left-0 right-0 z-40 shadow-lg"
      >
        <div className="p-6 space-y-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-base font-medium text-gray-900"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <Link
              href="/login"
              className="block w-full py-3 text-center text-gray-600 font-medium hover:text-gray-900"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="block w-full py-3 rounded-xl bg-primary text-white text-center font-medium hover:bg-primary/90"
            >
              시작하기
            </Link>
          </div>
        </div>
      </motion.div>

      <main className="pt-32 pb-20 px-6">
        {/* Hero */}
        <div className="max-w-4xl mx-auto text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-6">
              개인정보처리방침
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed">
              서치드는 이용자의 개인정보를 소중히 다루고 안전하게 보호합니다.
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
                  포텐시아 주식회사(이하 &quot;회사&quot;)는 정보통신망 이용촉진 및 정보보호 등에 관한 법률, 개인정보 보호법 등 관련 법령에 따라 이용자의 개인정보를 보호하고, 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이 개인정보처리방침을 수립·공개합니다.
                </p>
              </section>

              <section id="collected-items" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제2조 (수집하는 개인정보의 항목)</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">1. 회원가입 및 서비스 이용 시 수집하는 항목</h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-600 ml-4">
                      <li>필수항목: 이메일 주소, 비밀번호, 이름, 휴대폰 번호</li>
                      <li>선택항목: 회사명, 직책, 부서명</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">2. 서비스 이용 과정에서 생성되어 수집되는 정보</h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-600 ml-4">
                      <li>IP 주소, 쿠키, 서비스 이용 기록, 기기 정보, 브라우저 정보</li>
                      <li>이용자가 업로드하는 파일(이력서 등) 및 해당 파일 내 텍스트 데이터</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section id="purpose" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제3조 (개인정보의 수집 및 이용 목적)</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  회사는 수집한 개인정보를 다음의 목적을 위해 활용합니다.
                </p>
                <ol className="list-decimal list-inside space-y-2 text-gray-600">
                  <li><strong className="text-gray-900">서비스 제공 및 계약 이행:</strong> 이력서 분석, 콘텐츠 제공, 맞춤형 서비스 제공, 요금 결제 등</li>
                  <li><strong className="text-gray-900">회원 관리:</strong> 회원제 서비스 이용에 따른 본인확인, 개인식별, 가입의사 확인, 불량회원의 부정 이용 방지</li>
                  <li><strong className="text-gray-900">신규 서비스 개발 및 마케팅:</strong> 신규 서비스 개발, 통계학적 특성에 따른 서비스 제공, 이벤트 및 광고성 정보 제공</li>
                </ol>
              </section>

              <section id="retention" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제4조 (개인정보의 보유 및 이용 기간)</h2>
                <ol className="list-decimal list-inside space-y-3 text-gray-600">
                  <li>
                    회사는 이용자의 회원 탈퇴 시까지 개인정보를 보유 및 이용합니다. 단, 관계법령의 규정에 의하여 보존할 필요가 있는 경우 범령에서 정한 기간 동안 보관합니다.
                  </li>
                  <li>
                    <strong className="text-gray-900">관련 법령에 의한 보존 기간:</strong>
                    <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-gray-500">
                      <li>계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
                      <li>대금결제 및 재화 등의 공급에 관한 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
                      <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
                      <li>로그인 기록: 3개월 (통신비밀보호법)</li>
                    </ul>
                  </li>
                </ol>
              </section>

              <section id="provision" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제5조 (개인정보의 제3자 제공)</h2>
                <p className="text-gray-600 leading-relaxed">
                  회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.
                </p>
                <ul className="list-disc list-inside ml-4 mt-4 space-y-1 text-gray-600">
                  <li>이용자들이 사전에 동의한 경우</li>
                  <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
                </ul>
              </section>

              <section id="consignment" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제6조 (개인정보 처리 위탁)</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  회사는 서비스 이행을 위해 아래와 같이 외부 전문업체에 개인정보 처리를 위탁하고 있습니다.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-600 border border-gray-200 rounded-lg">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 font-semibold">수탁업체</th>
                        <th className="px-6 py-3 font-semibold">위탁 업무 내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white border-b border-gray-100">
                        <td className="px-6 py-4 font-medium text-gray-900">Amazon Web Services (AWS)</td>
                        <td className="px-6 py-4">서비스 제공을 위한 클라우드 서버 운영 및 데이터 저장</td>
                      </tr>
                      <tr className="bg-white border-b border-gray-100">
                        <td className="px-6 py-4 font-medium text-gray-900">OpenAI, Google, Anthropic</td>
                        <td className="px-6 py-4">이력서 텍스트 분석 및 처리 (비식별 데이터 전송)</td>
                      </tr>
                      <tr className="bg-white">
                        <td className="px-6 py-4 font-medium text-gray-900">Toss Payments</td>
                        <td className="px-6 py-4">결제 처리 및 에스크로 서비스</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section id="destruction" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제7조 (개인정보 파기 절차 및 방법)</h2>
                <ol className="list-decimal list-inside space-y-3 text-gray-600">
                  <li>
                    회사는 원칙적으로 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.
                  </li>
                  <li>
                    <strong className="text-gray-900">파기 절차:</strong> 이용자가 입력한 정보는 목적이 달성된 후 별도의 DB로 옮겨져(종이의 경우 별도의 서류함) 내부 방침 및 기타 관련 법령에 의한 정보보호 사유에 따라(보유 및 이용기간 참조) 일정 기간 저장된 후 파기됩니다.
                  </li>
                  <li>
                    <strong className="text-gray-900">파기 방법:</strong> 전자적 파일 형태로 저장된 개인정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다. 종이에 출력된 개인정보는 분쇄기로 분쇄하거나 소각을 통하여 파기합니다.
                  </li>
                </ol>
              </section>

              <section id="rights" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제8조 (이용자 및 법정대리인의 권리와 행사 방법)</h2>
                <ol className="list-decimal list-inside space-y-3 text-gray-600">
                  <li>
                    이용자는 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정할 수 있으며 가입 해지를 요청할 수 있습니다.
                  </li>
                  <li>
                    이용자가 개인정보의 오류에 대한 정정을 요청한 경우에는 정정을 완료하기 전까지 당해 개인정보를 이용 또는 제공하지 않습니다.
                  </li>
                  <li>
                    권리 행사는 회사에 대해 서면, 전화, 전자우편, 모사전송(FAX) 등을 통하여 하실 수 있으며 회사는 이에 대해 지체 없이 조치하겠습니다.
                  </li>
                </ol>
              </section>

              <section id="safety" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제9조 (개인정보의 안전성 확보 조치)</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  회사는 개인정보보호법 제29조에 따라 다음과 같이 안전성 확보에 필요한 기술적/관리적 및 물리적 조치를 하고 있습니다.
                </p>
                <ol className="list-decimal list-inside space-y-2 text-gray-600">
                  <li><strong className="text-gray-900">개인정보의 암호화:</strong> 이용자의 비밀번호는 암호화 되어 저장 및 관리되고 있으며, 중요한 데이터는 파일 및 전송 데이터를 암호화하거나 파일 잠금 기능을 사용하는 등의 별도 보안기능을 사용하고 있습니다.</li>
                  <li><strong className="text-gray-900">해킹 등에 대비한 기술적 대책:</strong> 회사는 해킹이나 컴퓨터 바이러스 등에 의한 개인정보 유출 및 훼손을 막기 위하여 보안프로그램을 설치하고 주기적인 갱신·점검을 하며 외부로부터 접근이 통제된 구역에 시스템을 설치하고 기술적/물리적으로 감시 및 차단하고 있습니다.</li>
                  <li><strong className="text-gray-900">개인정보 취급 직원의 최소화 및 교육:</strong> 개인정보를 취급하는 직원을 지정하고 담당자에 한정시켜 최소화 하여 개인정보를 관리하는 대책을 시행하고 있습니다.</li>
                </ol>
              </section>

              <section id="automations" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제10조 (자동화된 개인정보 처리)</h2>
                <p className="text-gray-600 leading-relaxed">
                  회사는 서비스 제공을 위해 AI 기술을 활용하여 이력서 내의 정보를 자동으로 분석하고 추출합니다. 이 과정에서 추출된 정보는 서비스 제공 목적으로만 사용되며, 이용자는 언제든지 이러한 자동화된 처리에 대해 거부하거나 설명을 요구할 수 있습니다.
                </p>
              </section>

              <section id="cookies" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제11조 (개인정보 자동수집 장치의 설치, 운영 및 그 거부에 관한 사항)</h2>
                <ol className="list-decimal list-inside space-y-3 text-gray-600">
                  <li>
                    회사는 이용자에게 개별적인 맞춤서비스를 제공하기 위해 이용정보를 저장하고 수시로 불러오는 &apos;쿠키(cookie)&apos;를 사용합니다.
                  </li>
                  <li>
                    쿠키는 웹사이트를 운영하는데 이용되는 서버(http)가 이용자의 컴퓨터 브라우저에게 보내는 소량의 정보이며 이용자들의 PC 컴퓨터내의 하드디스크에 저장되기도 합니다.
                  </li>
                  <li>
                    <strong className="text-gray-900">쿠키의 설치·운영 및 거부:</strong> 웹브라우저 상단의 도구&gt;인터넷 옵션&gt;개인정보 메뉴의 옵션 설정을 통해 쿠키 저장을 거부할 수 있습니다.
                  </li>
                </ol>
              </section>

              <section id="privacy-officer" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제12조 (개인정보 보호책임자)</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
                </p>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                  <p className="font-bold text-gray-900 mb-1">개인정보 보호책임자</p>
                  <ul className="text-gray-600 space-y-1 text-sm">
                    <li>성명: 김보안</li>
                    <li>직책: CISO (정보보호최고책임자)</li>
                    <li>이메일: privacy@rai.kr</li>
                    <li>연락처: 02-1234-5678</li>
                  </ul>
                </div>
              </section>

              <section id="changes" className="scroll-mt-32">
                <h2 className="text-xl font-bold text-gray-900 mb-4">제13조 (개인정보처리방침의 변경)</h2>
                <p className="text-gray-600 leading-relaxed">
                  이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.
                </p>
              </section>

              <section className="pt-8 border-t border-gray-100 mt-12">
                <h2 className="text-xl font-bold text-gray-900 mb-4">부칙</h2>
                <p className="text-gray-600">본 방침은 2025년 1월 13일부터 시행됩니다.</p>
              </section>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-gray-400" />
            </div>
            <span className="text-sm text-gray-500">
              © 2025 서치드. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-8 text-sm text-gray-500">
            <Link href="/terms" className="hover:text-gray-900 transition-colors">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-gray-900 transition-colors">
              개인정보처리방침
            </Link>
            <Link href="/support" className="hover:text-gray-900 transition-colors">
              문의하기
            </Link>
          </div>
        </div>
      </footer>

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
    </div>
  );
}

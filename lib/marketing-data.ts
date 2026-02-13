
import {
    Zap,
    Building2,
    Brain,
    Shield,
    FileSearch,
    Users,
    Lock,
} from "lucide-react";

// Navigation links (Korean)
export const NAV_LINKS = [
    { href: "/products", label: "기능" },
    { href: "/pricing", label: "요금" },
    { href: "/support", label: "지원" },
];

export const PRICING_PLANS = [
    {
        name: "Starter",
        description: "개인 헤드헌터 또는 소규모 팀을 위한 플랜",
        price: "79,000",
        period: "월",
        icon: Zap,
        highlight: false,
        features: [
            "월 50건 이력서 분석",
            "2-Way AI Cross-Check (GPT + Gemini)",
            "기본 시맨틱 검색",
            "블라인드 내보내기 (월 30회)",
            "이메일 지원",
            "기본 리스크 대시보드",
        ],
        notIncluded: [
            "3-Way AI Cross-Check",
            "팀 협업 기능",
            "API 액세스",
            "우선 지원",
        ],
        cta: "Starter 시작하기",
        ctaLink: "/signup?plan=starter",
    },
    {
        name: "Professional",
        description: "성장하는 서치펌과 HR팀을 위한 플랜",
        price: "149,000",
        period: "월",
        icon: Building2,
        highlight: true,
        badge: "인기",
        features: [
            "월 150건 이력서 분석",
            "3-Way AI Cross-Check (GPT + Gemini + Claude)",
            "고급 시맨틱 검색 + 필터",
            "무제한 블라인드 내보내기",
            "우선 이메일 + 채팅 지원",
            "전체 리스크 대시보드",
            "팀 협업 (최대 5명)",
            "API 액세스",
            "커스텀 내보내기 템플릿",
            "포지션 매칭",
        ],
        notIncluded: [],
        cta: "Professional 시작하기",
        ctaLink: "/signup?plan=pro",
    },
];

export const TESTIMONIALS = [
    {
        quote: "솔직히 반신반의했는데, 첫 달에 커미션 2건이 더 나왔어요. JD 받고 1시간 안에 제안하니까 경쟁사보다 무조건 빨라요. 클라이언트가 '벌써요?' 그래요.",
        metric: "월 커미션 +2건",
        author: "이민지",
        role: "팀장 · 10년차",
        company: "금융/핀테크",
        avatarBg: "from-emerald-500 to-teal-600",
    },
    {
        quote: "예전엔 포지션 3개 돌리는 게 한계였어요. 지금은 5개 동시에 돌려요. 제안 속도가 빨라지니까 커버할 수 있는 포지션 수 자체가 늘어났어요.",
        metric: "포지션 커버리지 +67%",
        author: "김소연",
        role: "시니어 파트너 · 12년차",
        company: "IT/테크 전문",
        avatarBg: "from-violet-500 to-purple-600",
    },
    {
        quote: "PC에 이력서 5,000개가 썩고 있었어요. 그게 다 잠재 커미션인데. 이제는 '3년 전 그 후보'도 10초면 찾아서 바로 연락해요. 재활성만으로 분기에 3건 클로징했어요.",
        metric: "기존 DB로 분기 +3건",
        author: "박준혁",
        role: "헤드헌터 · 8년차",
        company: "반도체/제조",
        avatarBg: "from-blue-500 to-cyan-600",
    },
];

export const CORE_FEATURES = [
    {
        icon: Brain,
        title: "두 번 검증, 한 번에 정확하게",
        description:
            "두 개의 AI가 각각 이력서를 읽고 서로 검증합니다. 사람이 놓치는 것도, AI 하나가 틀리는 것도 잡아냅니다.",
        details: [
            "99.2% 분석 정확도",
            "오타·누락 자동 감지",
            "신뢰도 점수로 한눈에 확인",
        ],
    },
    {
        icon: Shield,
        title: "후보자 정보, 걱정 없이",
        description:
            "이름, 연락처, 주민번호 같은 민감 정보는 자동으로 암호화됩니다. 규정 준수도 알아서.",
        details: [
            "금융권 수준 암호화 적용",
            "민감정보 자동 감지·보호",
            "팀원별 접근 권한 분리",
        ],
    },
    {
        icon: Zap,
        title: "이력서 올리고 30초면 끝",
        description:
            "PDF든 HWP든 DOCX든, 그냥 올리세요. 30초 후엔 깔끔하게 정리된 프로필이 됩니다.",
        details: [
            "어떤 파일 형식이든 OK",
            "드래그 앤 드롭으로 간편 업로드",
            "한 번에 여러 개도 가능",
        ],
    },
    {
        icon: FileSearch,
        title: "원하는 인재, 말로 찾으세요",
        description:
            "\"마케팅 경력 3년, 스타트업 경험 있는 분\" 이렇게 검색하면 됩니다. 딱 맞는 후보자가 나옵니다.",
        details: [
            "자연어로 검색 가능",
            "비슷한 표현도 알아서 찾기",
            "적합도 점수로 순위 확인",
        ],
    },
    {
        icon: Users,
        title: "같은 사람, 여러 이력서? 자동 정리",
        description:
            "한 후보자가 여러 번 지원했거나 버전이 다른 이력서가 있어도 자동으로 묶어줍니다.",
        details: [
            "중복 후보자 자동 감지",
            "어떤 버전이 최신인지 표시",
            "이력서 변경 이력 추적",
        ],
    },
    {
        icon: Lock,
        title: "공정한 채용을 위한 블라인드 이력서",
        description:
            "이름, 사진, 출신학교를 가린 이력서를 클릭 한 번으로 만들 수 있습니다. 실력만 보세요.",
        details: [
            "클릭 한 번으로 PDF 생성",
            "가릴 항목 직접 선택 가능",
            "우리 회사 양식으로 커스텀",
        ],
    },
];

export const FAQ_CATEGORIES = [
    {
        title: "시작하기",
        faqs: [
            {
                question: "서치드는 어떤 서비스인가요?",
                answer:
                    "서치드는 AI 기반 이력서 분석 플랫폼입니다. 헤드헌터와 HR 담당자를 위해 이력서를 자동으로 분석하고, 후보자를 검색하며, 데이터를 안전하게 관리할 수 있습니다.",
            },
            {
                question: "어떤 파일 형식을 지원하나요?",
                answer:
                    "PDF, HWP, DOCX 형식의 이력서를 지원합니다. 업로드 시 자동으로 형식을 인식하여 처리합니다.",
            },
            {
                question: "무료 체험은 어떻게 시작하나요?",
                answer:
                    "회원가입 후 14일간 모든 기능을 무료로 체험할 수 있습니다. 신용카드 정보 없이 바로 시작할 수 있습니다.",
            },
        ],
    },
    {
        title: "기능 관련",
        faqs: [
            {
                question: "2-Way AI Cross-Check이 무엇인가요?",
                answer:
                    "GPT-4o와 Gemini 1.5 Pro 두 개의 AI 엔진이 독립적으로 이력서를 분석하고 결과를 교차 검증합니다. 이를 통해 99.2% 이상의 분석 정확도를 달성합니다.",
            },
            {
                question: "시맨틱 검색은 어떻게 작동하나요?",
                answer:
                    "벡터 임베딩 기술을 사용하여 키워드가 아닌 의미를 기반으로 검색합니다. 예를 들어 'React'를 검색하면 'ReactJS', 'React.js', '리액트' 등 관련 키워드도 함께 검색됩니다.",
            },
            {
                question: "블라인드 내보내기란 무엇인가요?",
                answer:
                    "이름, 연락처, 사진 등 개인 식별 정보를 제거한 이력서를 PDF로 내보내는 기능입니다. 공정한 채용 프로세스를 지원합니다.",
            },
        ],
    },
    {
        title: "보안 & 개인정보",
        faqs: [
            {
                question: "데이터는 어떻게 보호되나요?",
                answer:
                    "모든 민감한 데이터는 AES-256-GCM으로 암호화됩니다. Row Level Security(RLS)를 통해 사용자별 데이터가 완벽히 격리됩니다.",
            },
            {
                question: "GDPR/PIPA를 준수하나요?",
                answer:
                    "네, 서치드는 GDPR과 개인정보보호법(PIPA)을 준수합니다. 데이터 삭제 요청, 접근 권한 관리, 처리 동의 등을 지원합니다.",
            },
            {
                question: "데이터는 어디에 저장되나요?",
                answer:
                    "모든 데이터는 AWS 한국 리전에 저장됩니다. 추가 리전 지원이 필요한 경우 Enterprise 플랜으로 문의해 주세요.",
            },
        ],
    },
    {
        title: "결제 & 요금",
        faqs: [
            {
                question: "플랜을 변경할 수 있나요?",
                answer:
                    "언제든지 플랜을 업그레이드하거나 다운그레이드할 수 있습니다. 변경은 다음 결제 주기부터 적용됩니다.",
            },
            {
                question: "결제 수단은 무엇을 지원하나요?",
                answer:
                    "신용카드(Visa, Mastercard, AMEX)와 계좌이체를 지원합니다. Enterprise 플랜은 세금계산서 발행도 가능합니다.",
            },
            {
                question: "환불 정책은 어떻게 되나요?",
                answer:
                    "결제일로부터 14일 이내 전액 환불이 가능합니다. 14일이 경과한 후에는 환불이 불가하며, 구독은 현재 결제 주기 종료 시까지 유지됩니다.",
            },
        ],
    },
];

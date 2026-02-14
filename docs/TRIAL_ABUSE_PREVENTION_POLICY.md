# RAI 무료 트라이얼 악용 방지 정책

**작성일:** 2026-01-16
**버전:** 1.0
**목적:** 실명인증 없이 무료 7일 트라이얼 악용 방지

---

## 1. 문제 정의

### 현재 상황
- 7일 무료 트라이얼 제공
- 이메일 가입만으로 서비스 이용 가능
- 실명인증 도입 불가

### 악용 시나리오
```
악용자 → email1@gmail.com 가입 → 7일 무료 사용 → 만료
      → email2@gmail.com 가입 → 7일 무료 사용 → 만료
      → email3@gmail.com 가입 → ...무한 반복
```

### 비즈니스 영향
- 매출 손실 (유료 전환율 저하)
- 서버 리소스 낭비 (AI API 비용)
- 정상 사용자 대비 불공정

---

## 2. 다층 방어 전략 (Defense in Depth)

### 2.1 1차 방어선: 가입 단계 제한

#### A. 휴대폰 번호 인증 (권장 - 최우선)
```
정책: 트라이얼 시작 시 휴대폰 번호 인증 필수
효과: 1인 1번호 원칙으로 대부분의 악용 차단
```

| 항목 | 내용 |
|------|------|
| 구현 방식 | SMS OTP 인증 (6자리, 3분 유효) |
| 제한 | 동일 번호로 1회만 트라이얼 가능 |
| 저장 | 번호 해시값만 저장 (개인정보 최소화) |
| 비용 | 건당 약 20-30원 (Twilio/NHN Cloud) |
| 우회 난이도 | 높음 (대포폰 필요) |

```sql
-- 스키마 추가
ALTER TABLE users ADD COLUMN phone_hash VARCHAR(64) UNIQUE;
ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ;

-- 트라이얼 시작 전 체크
SELECT EXISTS(
  SELECT 1 FROM users
  WHERE phone_hash = hash('+821012345678')
  AND trial_used = true
);
```

#### B. 일회용 이메일 차단
```
정책: 일회용/임시 이메일 도메인으로 가입 차단
효과: 가장 쉬운 악용 경로 차단
```

```javascript
// 차단 도메인 리스트 (지속 업데이트 필요)
const BLOCKED_DOMAINS = [
  'guerrillamail.com', 'tempmail.com', '10minutemail.com',
  'mailinator.com', 'throwaway.email', 'temp-mail.org',
  'fakeinbox.com', 'trashmail.com', 'yopmail.com',
  // ... 500+ 도메인
];

// 가입 시 체크
if (BLOCKED_DOMAINS.includes(emailDomain)) {
  return error("일회용 이메일은 사용할 수 없습니다.");
}
```

#### C. OAuth 전용 가입 (권장)
```
정책: Google/LinkedIn/Kakao OAuth로만 가입 허용
효과: 계정 생성 비용 증가로 악용 억제
```

| OAuth 제공자 | 악용 난이도 | 권장도 |
|-------------|-----------|-------|
| Google | 높음 (전화번호 필요) | 필수 |
| LinkedIn | 매우 높음 (실명 기반) | 필수 |
| Kakao | 높음 (전화번호 필요) | 권장 |
| GitHub | 중간 | 선택 |
| 이메일/비밀번호 | 낮음 | **제거** |

---

### 2.2 2차 방어선: 디바이스 핑거프린팅

#### A. 브라우저 핑거프린트
```
정책: 동일 디바이스에서 다중 트라이얼 차단
효과: 같은 기기에서 여러 계정 생성 방지
```

```javascript
// FingerprintJS Pro 사용 (또는 오픈소스 대안)
import FingerprintJS from '@fingerprintjs/fingerprintjs-pro';

const fp = await FingerprintJS.load({ apiKey: 'your-api-key' });
const result = await fp.get();
const visitorId = result.visitorId; // 고유 디바이스 ID

// 서버에서 체크
if (await isDeviceUsedForTrial(visitorId)) {
  return error("이미 이 기기에서 트라이얼을 사용하셨습니다.");
}
```

**수집 데이터:**
- Canvas fingerprint
- WebGL fingerprint
- Audio fingerprint
- 설치된 폰트 목록
- 화면 해상도
- 타임존
- 언어 설정
- 플러그인 목록

#### B. IP 기반 제한
```
정책: 동일 IP에서 과도한 트라이얼 가입 제한
주의: 사무실/학교 공용 IP 고려 필요
```

```javascript
// IP별 트라이얼 제한 (유연하게 설정)
const IP_TRIAL_LIMITS = {
  residential: 3,    // 가정용 IP: 3계정까지
  business: 10,      // 기업 IP: 10계정까지
  datacenter: 0,     // 데이터센터 IP: 차단 (VPN/프록시)
  mobile: 5,         // 모바일 IP: 5계정까지
};

// MaxMind GeoIP2로 IP 타입 분류
const ipType = await geoip.getIPType(clientIP);
const limit = IP_TRIAL_LIMITS[ipType];
```

---

### 2.3 3차 방어선: 행동 기반 탐지

#### A. 악용 패턴 탐지
```
정책: 비정상적인 사용 패턴 자동 탐지 및 제한
효과: 정교한 악용자 식별
```

**의심 지표 (Risk Signals):**

| 지표 | 점수 | 설명 |
|------|-----|------|
| 동일 IP에서 7일 내 3+ 가입 | +30 | IP 기반 반복 |
| 비슷한 이메일 패턴 | +20 | user1@, user2@, user3@ |
| 가입 직후 대량 업로드 | +15 | 무료 크레딧 소진 목적 |
| 디바이스 핑거프린트 유사 | +40 | 같은 기기 의심 |
| VPN/프록시 사용 | +25 | IP 우회 시도 |
| 가입 후 결제정보 미입력 | +10 | 유료 전환 의사 없음 |
| 트라이얼 종료 직전 대량 사용 | +15 | 막판 몰아치기 |

```javascript
// 리스크 점수 계산
async function calculateRiskScore(userId) {
  let score = 0;

  // IP 패턴 체크
  const ipTrialCount = await getTrialCountByIP(userIP, 7);
  if (ipTrialCount >= 3) score += 30;

  // 이메일 패턴 체크
  if (await hasSimilarEmailPattern(email)) score += 20;

  // 디바이스 체크
  const fpMatch = await findSimilarFingerprint(fingerprint);
  if (fpMatch) score += 40;

  // VPN 체크
  if (await isVPNorProxy(userIP)) score += 25;

  return score;
}

// 점수별 대응
if (riskScore >= 70) {
  // 가입 차단 + 수동 검토 요청
  await flagForManualReview(userId);
  return error("가입 처리 중 문제가 발생했습니다. 고객센터에 문의해주세요.");
} else if (riskScore >= 40) {
  // 추가 인증 요구 (전화번호)
  return requirePhoneVerification();
}
```

#### B. 크레딧 사용 패턴 모니터링
```
정책: 비정상적 크레딧 소비 패턴 탐지
효과: 대량 악용 조기 차단
```

```javascript
// 이상 사용 패턴 알림
const alerts = [
  { condition: 'credits_used > 80% in first 3 days', action: 'review' },
  { condition: 'uploads > 50 in first day', action: 'throttle' },
  { condition: 'all_credits_used AND trial_remaining > 10days', action: 'flag' },
];
```

---

### 2.4 4차 방어선: 트라이얼 구조 변경

#### A. 크레딧 기반 트라이얼 (권장)
```
정책: 기간 무제한 + 크레딧 제한으로 전환
효과: 악용해도 손해가 제한적
```

**현재 vs 변경안:**

| 구분 | 현재 | 변경안 |
|------|------|--------|
| 기간 | 7일 | 무제한 |
| 크레딧 | 100 | 20 |
| 기능 제한 | 없음 | 일부 (대량 내보내기 등) |

```
장점:
- "무료로 계속 쓸 수 있다"는 인식 → 악용 동기 감소
- 20 크레딧으로 가치 경험 → 유료 전환 유도
- 다중 계정 만들어도 20 크레딧 × N → 비효율

단점:
- 기존 7일 마케팅 메시지 변경 필요
```

#### B. 점진적 기능 해제 (Freemium)
```
정책: 무료 기본 기능 + 유료 프리미엄 기능
효과: 무료로도 쓸 수 있어 악용 동기 감소
```

| 기능 | Free | Starter | Pro |
|------|------|---------|-----|
| 이력서 업로드 | 5/월 | 100/월 | 500/월 |
| AI 분석 | 기본 (1-Way) | 2-Way | 3-Way |
| 검색 | 키워드만 | 시맨틱 | 시맨틱+필터 |
| 블라인드 내보내기 | 불가 | 10/월 | 무제한 |
| 프로젝트 폴더 | 1개 | 10개 | 무제한 |

---

## 3. 권장 구현 로드맵

### Phase 1: 즉시 적용 (Week 1)
- [ ] 일회용 이메일 도메인 차단
- [ ] Google/LinkedIn OAuth 전용 가입 전환
- [ ] IP 기반 가입 속도 제한 (5분에 1회)

### Phase 2: 단기 (Week 2-3)
- [ ] 휴대폰 번호 인증 추가
- [ ] 디바이스 핑거프린팅 도입
- [ ] VPN/프록시 탐지

### Phase 3: 중기 (Month 2)
- [ ] 행동 기반 리스크 스코어링
- [ ] 관리자 대시보드 (의심 계정 리스트)
- [ ] 자동 플래깅 시스템

### Phase 4: 장기 (Quarter 2)
- [ ] 크레딧 기반 트라이얼 전환 검토
- [ ] Freemium 모델 A/B 테스트
- [ ] ML 기반 악용 탐지

---

## 4. 정책 문서 (이용약관 추가)

### 4.1 서비스 이용약관 추가 조항

```markdown
제X조 (무료 체험 이용 제한)

1. 무료 체험(트라이얼)은 1인 1회에 한하여 제공됩니다.
2. 다음 행위는 서비스 악용으로 간주하며, 회사는 사전 통보 없이
   계정을 정지하거나 서비스 이용을 제한할 수 있습니다:

   가. 여러 개의 계정을 생성하여 무료 체험을 반복 이용하는 행위
   나. 타인의 명의나 정보를 도용하여 가입하는 행위
   다. 자동화된 수단을 이용하여 대량으로 계정을 생성하는 행위
   라. VPN, 프록시 등을 이용하여 위 제한을 우회하는 행위

3. 악용이 확인된 경우, 회사는 다음 조치를 취할 수 있습니다:
   가. 해당 계정 즉시 정지
   나. 관련 계정 전체 정지
   다. 향후 서비스 이용 영구 제한
   라. 법적 조치 (민형사상 책임 청구)

4. 정당한 사유 없이 환불을 요청하거나, 악용 목적의 환불 요청은
   거부될 수 있습니다.
```

### 4.2 가입 시 동의 문구

```
□ 본인은 RAI 서비스의 무료 체험을 처음 이용하며,
  다른 계정으로 무료 체험을 이용한 적이 없음을 확인합니다.
  (허위 진술 시 계정 정지 및 법적 조치의 대상이 될 수 있습니다)
```

---

## 5. 대응 매뉴얼

### 5.1 악용 의심 계정 처리 프로세스

```
[자동 탐지] → [플래깅] → [수동 검토] → [조치 결정]
     ↓            ↓           ↓            ↓
  리스크점수    관리자알림   증거수집     정지/경고/해제
```

### 5.2 고객 문의 대응 스크립트

**케이스 1: "왜 가입이 안 되나요?"**
```
안녕하세요, RAI 고객지원입니다.

죄송합니다만, 보안 정책에 따라 가입이 제한되었습니다.
혹시 이전에 다른 이메일로 RAI를 이용하신 적이 있으신가요?

무료 체험은 1인 1회로 제한되어 있으며,
이미 체험을 이용하신 경우 유료 플랜으로 가입해주시기 바랍니다.

문의사항이 있으시면 support@rai.com으로 연락주세요.
```

**케이스 2: "여러 계정 만든 적 없는데요"**
```
확인 감사합니다.

간혹 동일 네트워크(회사, 학교)에서 다른 분이
이미 체험을 이용한 경우에도 제한이 발생할 수 있습니다.

본인 확인을 위해 아래 정보를 support@rai.com으로 보내주시면
수동으로 검토 후 안내드리겠습니다:

1. 가입 시도한 이메일 주소
2. 소속 회사/기관명
3. 간단한 사용 목적

불편을 드려 죄송합니다.
```

---

## 6. 모니터링 대시보드 요구사항

### 6.1 필수 지표

```javascript
// 관리자 대시보드 KPIs
const dashboardMetrics = {
  // 악용 탐지
  flaggedAccounts: '의심 계정 수 (오늘/주간)',
  blockRate: '가입 차단율 (%)',
  riskScoreDistribution: '리스크 점수 분포',

  // 트라이얼 현황
  activeTrials: '활성 트라이얼 수',
  trialToConversion: '트라이얼→유료 전환율',
  avgTrialUsage: '평균 크레딧 사용량',

  // 패턴 분석
  topSuspiciousIPs: '의심 IP Top 10',
  duplicateFingerprints: '중복 디바이스 감지',
  emailPatternAlerts: '이메일 패턴 알림',
};
```

### 6.2 알림 설정

| 이벤트 | 알림 채널 | 빈도 |
|--------|----------|------|
| 고위험 계정 탐지 (점수 70+) | Slack + Email | 실시간 |
| 일일 차단 계정 10+ | Slack | 일 1회 |
| 동일 IP 5+ 가입 시도 | Dashboard | 실시간 |
| 트라이얼 전환율 급락 | Email | 주 1회 |

---

## 7. 예상 효과

### 구현 전
- 악용률: 추정 15-25%
- 트라이얼→유료 전환율: 5-8%

### 구현 후 (예상)
- 악용률: 3-5%로 감소
- 트라이얼→유료 전환율: 10-15%로 상승
- 연간 매출 증가: 20-30% (악용 방지분)

---

## 8. 최종 권장 조합

### MVP (즉시 적용)
```
1. OAuth 전용 가입 (이메일/비밀번호 제거)
2. 일회용 이메일 차단
3. 휴대폰 번호 인증 (트라이얼 시작 시)
```

### 고도화 (Phase 2+)
```
4. 디바이스 핑거프린팅
5. 행동 기반 리스크 스코어
6. 크레딧 기반 트라이얼 전환
```

**예상 악용 차단율: 90%+**

---

*본 정책은 비즈니스 상황에 따라 조정될 수 있으며,
분기별로 효과를 측정하고 업데이트합니다.*

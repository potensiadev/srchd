# JD 추출 고도화 기획안

## 1. 현황 분석

### 1.1 현재 추출되는 항목 (14개)
| 필드명 | 설명 | DB 컬럼 |
|--------|------|---------|
| title | 포지션명 | title |
| clientCompany | 회사명 | client_company |
| department | 부서명 | department |
| description | 직무 설명 요약 | description |
| requiredSkills | 필수 스킬 (태그) | required_skills |
| preferredSkills | 우대 스킬 (태그) | preferred_skills |
| minExpYears | 최소 경력 | min_exp_years |
| maxExpYears | 최대 경력 | max_exp_years |
| requiredEducationLevel | 학력 요건 | required_education_level |
| preferredMajors | 우대 전공 | preferred_majors |
| locationCity | 근무지 | location_city |
| jobType | 고용 형태 | job_type |
| salaryMin/Max | 연봉 범위 | salary_min/max |
| deadline | 채용 마감일 | deadline |

### 1.2 현재 문제점
1. **정보 손실**: JD의 상세 내용이 짧은 "description" 요약으로 압축됨
2. **구조화 부족**: "주요업무", "자격요건", "우대사항" 원문이 보존되지 않음
3. **스킬만 추출**: 자격요건 전체 텍스트 없이 스킬 태그만 추출
4. **매칭 품질 저하**: 시맨틱 매칭에 활용할 수 있는 상세 정보 부족

---

## 2. 개선 제안

### 2.1 신규 추가 항목 (4개)

| 필드명 | 설명 | 용도 |
|--------|------|------|
| **responsibilities** | 주요업무/담당업무 원문 | 업무 범위 파악, 시맨틱 매칭 |
| **qualifications** | 자격요건/필수요건 원문 | 필수 조건 전체 맥락 보존 |
| **preferredQualifications** | 우대사항/우대요건 원문 | 우대 조건 전체 맥락 보존 |
| **benefits** | 복리후생/혜택 | 포지션 매력도 정보 |

### 2.2 UI 카드 섹션 구성 (신규)

```
┌─────────────────────────────────────────────────────────────┐
│ 포지션 등록                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [기본 정보]        [주요 업무] ← NEW                        │
│  - 포지션명          - 추출된 주요업무 텍스트 (textarea)     │
│  - 회사명            - 수정 가능                             │
│  - 부서                                                      │
│  - 직무 설명                                                 │
│                                                             │
│  [필수 스킬]        [자격 요건] ← NEW                        │
│  - 추출된 텍스트     - 추출된 자격요건 텍스트 (textarea)     │
│  - 스킬 태그         - 학력, 경력 등 전체 맥락 보존          │
│                                                             │
│  [우대 스킬]        [우대 사항] ← NEW                        │
│  - 추출된 텍스트     - 추출된 우대사항 텍스트 (textarea)     │
│  - 스킬 태그         - 우대 전공 등 전체 맥락 보존           │
│                                                             │
│  [경력 & 학력]      [복리후생] ← NEW (Optional)              │
│  - 경력 범위         - 추출된 복리후생 텍스트                │
│  - 학력 요건                                                 │
│  - 우대 전공                                                 │
│                                                             │
│  [근무 조건]                                                 │
│  - 근무지, 고용형태                                          │
│  - 연봉, 마감일                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 기술 구현 계획

### 3.1 Phase 1: DB 스키마 확장

```sql
-- Migration: Add JD detail fields to positions table
ALTER TABLE positions ADD COLUMN IF NOT EXISTS responsibilities TEXT;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS qualifications TEXT;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS preferred_qualifications TEXT;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS benefits TEXT;

COMMENT ON COLUMN positions.responsibilities IS '주요업무/담당업무 원문';
COMMENT ON COLUMN positions.qualifications IS '자격요건/필수요건 원문';
COMMENT ON COLUMN positions.preferred_qualifications IS '우대사항/우대요건 원문';
COMMENT ON COLUMN positions.benefits IS '복리후생/혜택';
```

### 3.2 Phase 2: 추출 API 개선

**파일:** `app/api/positions/extract/route.ts`

```typescript
interface ExtractedPosition {
  // 기존 필드
  title: string;
  clientCompany: string;
  department: string;
  description: string;  // 직무 설명 요약 (유지)
  requiredSkills: string[];
  preferredSkills: string[];
  // ... 기타 기존 필드

  // 신규 필드
  responsibilities: string | null;        // 주요업무 원문
  qualifications: string | null;          // 자격요건 원문
  preferredQualifications: string | null; // 우대사항 원문
  benefits: string | null;                // 복리후생
}
```

**GPT 프롬프트 개선:**
```
{
  // ... 기존 필드
  "responsibilities": "주요업무/담당업무 섹션 원문 (bullet point 형식 유지, 없으면 null)",
  "qualifications": "자격요건/필수요건 섹션 원문 (bullet point 형식 유지, 없으면 null)",
  "preferredQualifications": "우대사항/우대요건 섹션 원문 (bullet point 형식 유지, 없으면 null)",
  "benefits": "복리후생/혜택 섹션 원문 (없으면 null)"
}

Important:
- responsibilities: "주요업무", "담당업무", "수행업무", "Role", "Responsibilities" 섹션 찾아서 원문 그대로 추출
- qualifications: "자격요건", "필수요건", "지원자격", "Requirements", "필수 사항" 섹션 찾아서 원문 그대로 추출
- preferredQualifications: "우대사항", "우대요건", "Preferred", "우대 사항" 섹션 찾아서 원문 그대로 추출
- benefits: "복리후생", "혜택", "Benefits", "처우" 섹션 찾아서 원문 그대로 추출
- 각 섹션의 bullet point, 번호 매기기 등 원문 형식을 최대한 보존
```

### 3.3 Phase 3: TypeScript 타입 업데이트

**파일:** `types/position.ts`

```typescript
export interface Position {
  // ... 기존 필드

  // 신규 필드
  responsibilities?: string;
  qualifications?: string;
  preferredQualifications?: string;
  benefits?: string;
}

export interface CreatePositionRequest {
  // ... 기존 필드
  responsibilities?: string;
  qualifications?: string;
  preferredQualifications?: string;
  benefits?: string;
}

export interface UpdatePositionRequest {
  // ... 기존 필드
  responsibilities?: string;
  qualifications?: string;
  preferredQualifications?: string;
  benefits?: string;
}
```

### 3.4 Phase 4: 프론트엔드 UI 구현

**파일:** `app/(dashboard)/positions/new/page.tsx`

```tsx
// 신규 State
const [responsibilities, setResponsibilities] = useState("");
const [qualifications, setQualifications] = useState("");
const [preferredQualifications, setPreferredQualifications] = useState("");
const [benefits, setBenefits] = useState("");

// JD 추출 시 매핑
setResponsibilities(extracted.responsibilities || "");
setQualifications(extracted.qualifications || "");
setPreferredQualifications(extracted.preferredQualifications || "");
setBenefits(extracted.benefits || "");

// 카드 섹션 UI
<section className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
  <div className="flex items-center gap-2 text-gray-900 font-medium">
    <ClipboardList className="w-5 h-5 text-blue-500" />
    주요 업무
  </div>
  <textarea
    value={responsibilities}
    onChange={(e) => setResponsibilities(e.target.value)}
    placeholder="JD에서 추출된 주요업무가 표시됩니다..."
    rows={6}
    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200..."
  />
</section>
```

### 3.5 Phase 5: API 엔드포인트 업데이트

**파일:** `app/api/positions/route.ts` (POST)
**파일:** `app/api/positions/[id]/route.ts` (PATCH)

```typescript
// 신규 필드 처리
if (body.responsibilities !== undefined)
  insertData.responsibilities = body.responsibilities;
if (body.qualifications !== undefined)
  insertData.qualifications = body.qualifications;
if (body.preferredQualifications !== undefined)
  insertData.preferred_qualifications = body.preferredQualifications;
if (body.benefits !== undefined)
  insertData.benefits = body.benefits;
```

### 3.6 Phase 6: 임베딩 개선

주요업무, 자격요건 등 신규 필드를 임베딩 생성에 포함하여 시맨틱 매칭 품질 향상:

```typescript
const embeddingText = [
  title,
  responsibilities,           // NEW
  qualifications,             // NEW
  `필수 스킬: ${requiredSkills.join(", ")}`,
  `우대 스킬: ${preferredSkills.join(", ")}`,
  description,
].filter(Boolean).join("\n");
```

---

## 4. 예상 효과

### 4.1 정보 보존율 향상
| 항목 | Before | After |
|------|--------|-------|
| 주요업무 | 요약만 | 원문 보존 |
| 자격요건 | 스킬 태그만 | 원문 + 태그 |
| 우대사항 | 스킬 태그만 | 원문 + 태그 |
| 복리후생 | 미추출 | 원문 보존 |

### 4.2 시맨틱 매칭 정확도 향상
- 더 풍부한 컨텍스트로 후보자-포지션 매칭 품질 향상
- "3년 이상 경력" 같은 자연어 표현도 보존

### 4.3 사용자 경험 개선
- JD 업로드 후 수정할 내용 최소화
- 원문을 보면서 필요 시 편집 가능

---

## 5. 구현 우선순위

| 순서 | 항목 | 예상 작업량 |
|------|------|-------------|
| 1 | DB 마이그레이션 | 작음 |
| 2 | 추출 API 프롬프트 개선 | 작음 |
| 3 | TypeScript 타입 업데이트 | 작음 |
| 4 | positions/new 페이지 UI | 중간 |
| 5 | positions/[id] 상세/수정 페이지 | 중간 |
| 6 | 임베딩 로직 개선 | 작음 |

---

## 6. 참고: 샘플 JD 구조

```
[기업부문] AI기술 기반 사전 컨설팅/기술검토 경력채용

■ 수행 업무 (→ responsibilities)
- 고객사 사전컨설팅
- AI 사업 기술 검토
- AI 사업 PoC 지원
- 핵심 기술 성능지표 관리

■ 필요 경험/경력 (→ qualifications 일부)
- 특정 사업군에 대한 적합 AI 서비스/솔루션 발굴
- AI서비스 기획 및 프로젝트 진행 경험
- AI/ML/DL 기반 데이터 분석, 모델 개발 경험

■ 필수 사항 (→ qualifications)
- 학사(4년제) 이상
- 관련직무 경력 3년이상

■ 우대 사항 (→ preferredQualifications)
- 석사 이상
- AI 관련 전공
- 관련 직무 5년 이상
- 클라우드/AI 관련 자격증 보유
```

---

## 7. 결론

본 기획안대로 구현 시:
1. JD 정보 손실 최소화
2. 시맨틱 매칭 품질 향상
3. 사용자 편의성 증대

구현을 진행할까요?

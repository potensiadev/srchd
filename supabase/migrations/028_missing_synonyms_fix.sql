-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 028: QA 테스트에서 발견된 누락 동의어 추가
-- 2026-01-13
--
-- QA 보고서 기반 누락 항목:
-- 1. 약어: DE, DS, PM, UXD, UID, MLE, DA, AE
-- 2. 접근성: a11y, WCAG
-- 3. 기타 누락 키워드
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ══════════════════════════════════════════════════════════════════════════
-- 1. 직책 약어 추가
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- Data 직군 약어
    ('데이터엔지니어', 'DE'),
    ('데이터과학자', 'DS'),
    ('데이터분석가', 'DA'),
    ('ML엔지니어', 'MLE'),
    ('애널리틱스엔지니어', 'AE'),
    ('애널리틱스엔지니어', '애널리틱스엔지니어'),
    ('애널리틱스엔지니어', 'Analytics Engineer'),

    -- PM/Design 직군 약어
    ('Product Manager', 'PM'),
    ('UX디자이너', 'UXD'),
    ('UI디자이너', 'UID'),
    ('프로덕트디자이너', 'PD'),
    ('Technical PM', 'TPM'),
    ('Technical PM', '테크니컬PM'),
    ('Program Manager', 'PgM'),
    ('Program Manager', '프로그램매니저'),

    -- DevOps 약어
    ('SRE', '에스알이'),
    ('SRE', 'Site Reliability Engineer'),
    ('SRE', '사이트신뢰성엔지니어'),

    -- Mobile 약어
    ('AOS개발자', 'AOS'),

    -- Frontend 약어
    ('프론트엔드', 'FE'),
    ('백엔드', 'BE')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. 접근성 키워드 추가
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    ('웹접근성', 'a11y'),
    ('웹접근성', 'WCAG'),
    ('웹접근성', 'WAI-ARIA'),
    ('웹접근성', 'ARIA'),
    ('웹접근성', 'Web Accessibility'),
    ('웹표준', 'Web Standards'),
    ('웹표준', 'W3C'),
    ('웹표준', '웹표준')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. 오타/발음 유사 키워드 (자주 검색되는 변형)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- 프론트엔드 오타
    ('프론트엔드', '프런트엔드'),
    ('프론트엔드', '프런트앤드'),
    ('프론트엔드', '프론트앤드'),

    -- 백엔드 오타
    ('백엔드', '백앤드'),
    ('백엔드', '벡엔드'),

    -- Kubernetes 발음 변형
    ('Kubernetes', '쿠베르네티스'),
    ('Kubernetes', '쿠버네테스'),

    -- TypeScript 구어체
    ('TypeScript', '타스'),
    ('TypeScript', '타입스'),

    -- JavaScript 구어체
    ('JavaScript', '자스'),
    ('JavaScript', '제이에스'),

    -- PostgreSQL 발음 변형
    ('PostgreSQL', '포스트그레에스큐엘'),
    ('PostgreSQL', '포스그레스'),

    -- Elasticsearch 발음 변형
    ('Elasticsearch', '일라스틱서치'),
    ('Elasticsearch', '엘라스틱'),

    -- React Native 변형
    ('React Native', '리엑트네이티브'),
    ('React Native', '리액트 네이티브'),

    -- Next.js 변형
    ('Next.js', 'Nextjs'),
    ('Next.js', 'NEXT'),
    ('Next.js', 'next'),

    -- Vue 변형
    ('Vue', 'Vue3'),
    ('Vue', 'vue3'),
    ('Vue', 'Vue2'),

    -- Angular 변형
    ('Angular', 'Angular2'),
    ('Angular', 'Angular4'),
    ('Angular', 'ng'),

    -- Docker 변형
    ('Docker', '도커컴포즈'),
    ('Docker', 'docker-compose'),

    -- AWS 변형
    ('AWS', 'amazon'),
    ('AWS', 'Amazon'),
    ('AWS', 'EC2'),
    ('AWS', 'S3'),
    ('AWS', 'Lambda'),

    -- GCP 변형
    ('GCP', 'GCE'),
    ('GCP', 'Cloud Functions'),

    -- CI/CD 키워드
    ('CI/CD', 'CICD'),
    ('CI/CD', '씨아이씨디'),
    ('CI/CD', 'CI CD'),
    ('CI/CD', 'Continuous Integration'),
    ('CI/CD', 'Continuous Deployment')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. 추가 기술 스택 동의어
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- State Management 추가
    ('Context API', 'Context API'),
    ('Context API', '컨텍스트'),
    ('Context API', 'React Context'),

    -- Build Tools 추가
    ('Rollup', 'Rollup'),
    ('Rollup', '롤업'),
    ('esbuild', 'esbuild'),
    ('esbuild', '이에스빌드'),
    ('SWC', 'SWC'),
    ('SWC', 'swc'),

    -- Testing 추가
    ('Vitest', 'Vitest'),
    ('Vitest', '비테스트'),

    -- CSS Framework 추가
    ('Bootstrap', 'Bootstrap'),
    ('Bootstrap', '부트스트랩'),
    ('Material UI', 'Material UI'),
    ('Material UI', 'MUI'),
    ('Material UI', '머티리얼UI'),
    ('Chakra UI', 'Chakra UI'),
    ('Chakra UI', '차크라'),
    ('Ant Design', 'Ant Design'),
    ('Ant Design', 'antd'),
    ('Ant Design', '앤트디자인'),

    -- API 관련
    ('OpenAPI', 'OpenAPI'),
    ('OpenAPI', 'Swagger'),
    ('OpenAPI', '스웨거'),
    ('Postman', 'Postman'),
    ('Postman', '포스트맨'),

    -- 인증/보안
    ('OAuth', 'OAuth'),
    ('OAuth', 'OAuth2'),
    ('OAuth', '오어스'),
    ('JWT', 'JWT'),
    ('JWT', 'JSON Web Token'),
    ('JWT', '제이더블유티'),

    -- 버전관리
    ('Git', 'GitHub'),
    ('Git', 'GitLab'),
    ('Git', 'Bitbucket'),

    -- 협업도구
    ('Slack', 'Slack'),
    ('Slack', '슬랙'),
    ('Discord', 'Discord'),
    ('Discord', '디스코드'),

    -- 프로젝트 관리
    ('Asana', 'Asana'),
    ('Asana', '아사나'),
    ('Trello', 'Trello'),
    ('Trello', '트렐로'),
    ('Monday', 'Monday'),
    ('Monday', '먼데이'),
    ('Monday', 'monday.com'),
    ('ClickUp', 'ClickUp'),
    ('ClickUp', '클릭업')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. 경력/레벨 키워드
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- 경력 표현
    ('경력', '경력직'),
    ('경력', '경력자'),
    ('경력', 'Experienced'),
    ('신입', '신입사원'),
    ('신입', '신규입사'),
    ('신입', 'Entry Level'),
    ('신입', 'Fresh'),

    -- 고용 형태
    ('정규직', 'Full-time'),
    ('정규직', 'FTE'),
    ('정규직', '정규'),
    ('계약직', 'Contract'),
    ('계약직', 'Contractor'),
    ('계약직', '파견'),
    ('프리랜서', 'Freelance'),
    ('프리랜서', '프리'),
    ('인턴', 'Intern'),
    ('인턴', 'Internship'),
    ('인턴', '인턴십'),

    -- 근무 형태
    ('원격근무', 'Remote'),
    ('원격근무', 'Work from Home'),
    ('원격근무', 'WFH'),
    ('원격근무', '재택'),
    ('원격근무', '재택근무'),
    ('하이브리드', 'Hybrid'),
    ('하이브리드', '혼합근무'),
    ('하이브리드', '주2회출근')
ON CONFLICT (variant) DO NOTHING;

-- 코멘트
COMMENT ON TABLE skill_synonyms IS
'스킬 동의어 매핑 테이블. Migration 028에서 QA 피드백 기반 누락 동의어 추가됨.';

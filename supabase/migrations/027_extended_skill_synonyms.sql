-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 027: 확장 스킬 동의어 (PM 키워드 기반)
-- 2026-01-13
--
-- PM 직군별 핵심 키워드 600개 기반 동의어 확장
-- 한글 혼합 검색 지원 강화
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Frontend Keywords (확장)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- State Management
    ('Redux', 'Redux'),
    ('Redux', '리덕스'),
    ('Redux', 'Redux Toolkit'),
    ('Redux', 'RTK'),
    ('MobX', 'MobX'),
    ('MobX', '몹엑스'),
    ('MobX', 'mobx-state-tree'),
    ('Zustand', 'Zustand'),
    ('Zustand', '주스탄드'),
    ('Recoil', 'Recoil'),
    ('Recoil', '리코일'),
    ('React Query', 'React Query'),
    ('React Query', '리액트쿼리'),
    ('React Query', 'TanStack Query'),
    ('SWR', 'SWR'),
    ('SWR', 'stale-while-revalidate'),

    -- Build Tools
    ('Webpack', 'Webpack'),
    ('Webpack', '웹팩'),
    ('Vite', 'Vite'),
    ('Vite', '비트'),
    ('Babel', 'Babel'),
    ('Babel', '바벨'),
    ('ESLint', 'ESLint'),
    ('ESLint', '이에스린트'),
    ('Prettier', 'Prettier'),
    ('Prettier', '프리티어'),

    -- CSS
    ('SCSS', 'SCSS'),
    ('SCSS', 'Sass'),
    ('SCSS', '사스'),
    ('Tailwind', 'Tailwind'),
    ('Tailwind', '테일윈드'),
    ('Tailwind', 'TailwindCSS'),
    ('styled-components', 'styled-components'),
    ('styled-components', '스타일드컴포넌트'),
    ('Emotion', 'Emotion'),
    ('Emotion', '이모션'),
    ('Emotion', '@emotion'),

    -- Testing
    ('Playwright', 'Playwright'),
    ('Playwright', '플레이라이트'),
    ('Testing Library', 'Testing Library'),
    ('Testing Library', '테스팅라이브러리'),
    ('Testing Library', 'RTL'),
    ('Storybook', 'Storybook'),
    ('Storybook', '스토리북'),

    -- Concepts
    ('SSR', 'SSR'),
    ('SSR', '서버사이드렌더링'),
    ('SSR', 'Server Side Rendering'),
    ('SSG', 'SSG'),
    ('SSG', '정적사이트생성'),
    ('SSG', 'Static Site Generation'),
    ('CSR', 'CSR'),
    ('CSR', '클라이언트사이드렌더링'),
    ('CSR', 'Client Side Rendering'),
    ('SPA', 'SPA'),
    ('SPA', '싱글페이지앱'),
    ('SPA', 'Single Page Application'),
    ('PWA', 'PWA'),
    ('PWA', '프로그레시브웹앱'),
    ('PWA', 'Progressive Web App'),
    ('SEO', 'SEO'),
    ('SEO', '검색엔진최적화'),
    ('SEO', 'Search Engine Optimization'),

    -- Accessibility
    ('웹접근성', '웹접근성'),
    ('웹접근성', 'Accessibility'),
    ('웹접근성', 'a11y'),
    ('웹접근성', 'WCAG'),

    -- Performance
    ('성능최적화', '성능최적화'),
    ('성능최적화', 'Performance'),
    ('성능최적화', '퍼포먼스최적화'),
    ('코드스플리팅', '코드스플리팅'),
    ('코드스플리팅', 'Code Splitting'),
    ('코드스플리팅', '코드분할'),
    ('레이지로딩', '레이지로딩'),
    ('레이지로딩', 'Lazy Loading'),
    ('레이지로딩', '지연로딩'),

    -- Design System
    ('디자인시스템', '디자인시스템'),
    ('디자인시스템', 'Design System'),
    ('Micro Frontend', 'Micro Frontend'),
    ('Micro Frontend', '마이크로프론트엔드'),
    ('Micro Frontend', 'MFE')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Backend Keywords (확장)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- Languages
    ('Elixir', 'Elixir'),
    ('Elixir', '엘릭서'),
    ('Clojure', 'Clojure'),
    ('Clojure', '클로저'),
    ('Haskell', 'Haskell'),
    ('Haskell', '하스켈'),
    ('Groovy', 'Groovy'),
    ('Groovy', '그루비'),

    -- Frameworks
    ('Koa', 'Koa'),
    ('Koa', '코아'),
    ('Fastify', 'Fastify'),
    ('Fastify', '패스티파이'),
    ('Gin', 'Gin'),
    ('Gin', '진'),
    ('Echo', 'Echo'),
    ('Echo', '에코'),
    ('Fiber', 'Fiber'),
    ('Fiber', '파이버'),
    ('Actix', 'Actix'),
    ('Actix', '액틱스'),
    ('Ktor', 'Ktor'),
    ('Ktor', '케이터'),
    ('Quarkus', 'Quarkus'),
    ('Quarkus', '쿼커스'),
    ('Micronaut', 'Micronaut'),
    ('Micronaut', '마이크로넛'),

    -- Databases (확장)
    ('Neo4j', 'Neo4j'),
    ('Neo4j', '네오포제이'),
    ('InfluxDB', 'InfluxDB'),
    ('InfluxDB', '인플럭스디비'),
    ('TimescaleDB', 'TimescaleDB'),
    ('TimescaleDB', '타임스케일'),
    ('CockroachDB', 'CockroachDB'),
    ('CockroachDB', '콕로치디비'),
    ('Supabase', 'Supabase'),
    ('Supabase', '수파베이스'),
    ('Memcached', 'Memcached'),
    ('Memcached', '멤캐시드'),

    -- Message Queue
    ('RabbitMQ', 'RabbitMQ'),
    ('RabbitMQ', '래빗엠큐'),
    ('ActiveMQ', 'ActiveMQ'),
    ('ActiveMQ', '액티브엠큐'),
    ('SQS', 'SQS'),
    ('SQS', 'Amazon SQS'),
    ('SQS', '에스큐에스'),
    ('NATS', 'NATS'),
    ('NATS', '내츠'),

    -- Architecture
    ('마이크로서비스', '마이크로서비스'),
    ('마이크로서비스', 'Microservices'),
    ('마이크로서비스', 'MSA'),
    ('서버리스', '서버리스'),
    ('서버리스', 'Serverless'),
    ('서버리스', 'Lambda'),

    -- API Gateway
    ('Kong', 'Kong'),
    ('Kong', '콩'),
    ('Kong', 'API Gateway'),
    ('Nginx', 'Nginx'),
    ('Nginx', '엔진엑스')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Data/ML Keywords (확장)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- Data Processing
    ('Flink', 'Flink'),
    ('Flink', '플링크'),
    ('Flink', 'Apache Flink'),
    ('Presto', 'Presto'),
    ('Presto', '프레스토'),
    ('Presto', 'Trino'),
    ('Hive', 'Hive'),
    ('Hive', '하이브'),
    ('dbt', 'dbt'),
    ('dbt', '디비티'),
    ('Dagster', 'Dagster'),
    ('Dagster', '대그스터'),
    ('Prefect', 'Prefect'),
    ('Prefect', '프리펙트'),
    ('Databricks', 'Databricks'),
    ('Databricks', '데이터브릭스'),
    ('Snowflake', 'Snowflake'),
    ('Snowflake', '스노우플레이크'),
    ('BigQuery', 'BigQuery'),
    ('BigQuery', '빅쿼리'),
    ('Redshift', 'Redshift'),
    ('Redshift', '레드시프트'),

    -- ML/AI
    ('Keras', 'Keras'),
    ('Keras', '케라스'),
    ('XGBoost', 'XGBoost'),
    ('XGBoost', '엑스지부스트'),
    ('LightGBM', 'LightGBM'),
    ('LightGBM', '라이트지비엠'),
    ('MLflow', 'MLflow'),
    ('MLflow', '엠엘플로우'),
    ('Kubeflow', 'Kubeflow'),
    ('Kubeflow', '쿠브플로우'),
    ('SageMaker', 'SageMaker'),
    ('SageMaker', '세이지메이커'),
    ('Hugging Face', 'Hugging Face'),
    ('Hugging Face', '허깅페이스'),
    ('Hugging Face', 'HF'),
    ('LangChain', 'LangChain'),
    ('LangChain', '랭체인'),
    ('LlamaIndex', 'LlamaIndex'),
    ('LlamaIndex', '라마인덱스'),
    ('RAG', 'RAG'),
    ('RAG', '래그'),
    ('RAG', 'Retrieval Augmented Generation'),
    ('LLM', 'LLM'),
    ('LLM', '엘엘엠'),
    ('LLM', 'Large Language Model'),
    ('NLP', 'NLP'),
    ('NLP', '엔엘피'),
    ('NLP', '자연어처리'),
    ('딥러닝', '딥러닝'),
    ('딥러닝', 'Deep Learning'),
    ('딥러닝', 'DL'),
    ('머신러닝', '머신러닝'),
    ('머신러닝', 'Machine Learning'),
    ('머신러닝', 'ML'),
    ('강화학습', '강화학습'),
    ('강화학습', 'Reinforcement Learning'),
    ('강화학습', 'RL'),
    ('Transformer', 'Transformer'),
    ('Transformer', '트랜스포머'),
    ('BERT', 'BERT'),
    ('BERT', '버트'),

    -- Analytics
    ('Tableau', 'Tableau'),
    ('Tableau', '태블로'),
    ('Power BI', 'Power BI'),
    ('Power BI', '파워비아이'),
    ('Looker', 'Looker'),
    ('Looker', '루커'),
    ('Metabase', 'Metabase'),
    ('Metabase', '메타베이스'),
    ('Superset', 'Superset'),
    ('Superset', '수퍼셋'),
    ('Superset', 'Apache Superset'),
    ('Amplitude', 'Amplitude'),
    ('Amplitude', '앰플리튜드'),
    ('Mixpanel', 'Mixpanel'),
    ('Mixpanel', '믹스패널'),
    ('GA4', 'GA4'),
    ('GA4', '지에이4'),
    ('GA4', 'Google Analytics'),
    ('Segment', 'Segment'),
    ('Segment', '세그먼트')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Mobile Keywords (확장)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- iOS
    ('SwiftUI', 'SwiftUI'),
    ('SwiftUI', '스위프트유아이'),
    ('UIKit', 'UIKit'),
    ('UIKit', '유아이킷'),
    ('Objective-C', 'Objective-C'),
    ('Objective-C', '오브젝티브씨'),
    ('Objective-C', 'ObjC'),
    ('CocoaPods', 'CocoaPods'),
    ('CocoaPods', '코코아팟'),
    ('Core Data', 'Core Data'),
    ('Core Data', '코어데이터'),
    ('Realm', 'Realm'),
    ('Realm', '렐름'),
    ('Combine', 'Combine'),
    ('Combine', '컴바인'),
    ('RxSwift', 'RxSwift'),
    ('RxSwift', '알엑스스위프트'),
    ('Alamofire', 'Alamofire'),
    ('Alamofire', '알라모파이어'),
    ('SnapKit', 'SnapKit'),
    ('SnapKit', '스냅킷'),

    -- Android
    ('Jetpack Compose', 'Jetpack Compose'),
    ('Jetpack Compose', '젯팩컴포즈'),
    ('Jetpack Compose', 'Compose'),
    ('Room', 'Room'),
    ('Room', '룸'),
    ('Retrofit', 'Retrofit'),
    ('Retrofit', '레트로핏'),
    ('Dagger', 'Dagger'),
    ('Dagger', '대거'),
    ('Dagger', 'Dagger2'),
    ('Dagger', 'Hilt'),
    ('Koin', 'Koin'),
    ('Koin', '코인'),
    ('Coroutines', 'Coroutines'),
    ('Coroutines', '코루틴'),
    ('Coroutines', 'Kotlin Coroutines'),
    ('LiveData', 'LiveData'),
    ('LiveData', '라이브데이터'),
    ('ViewModel', 'ViewModel'),
    ('ViewModel', '뷰모델'),

    -- Cross Platform
    ('Expo', 'Expo'),
    ('Expo', '엑스포'),
    ('Ionic', 'Ionic'),
    ('Ionic', '아이오닉'),
    ('Capacitor', 'Capacitor'),
    ('Capacitor', '캐패시터'),
    ('KMM', 'KMM'),
    ('KMM', '케이엠엠'),
    ('KMM', 'Kotlin Multiplatform Mobile'),

    -- Common
    ('Fastlane', 'Fastlane'),
    ('Fastlane', '패스트레인'),
    ('딥링크', '딥링크'),
    ('딥링크', 'Deep Link'),
    ('딥링크', 'Universal Link'),
    ('푸시알림', '푸시알림'),
    ('푸시알림', 'Push Notification'),
    ('푸시알림', 'FCM'),
    ('푸시알림', 'APNs'),
    ('인앱결제', '인앱결제'),
    ('인앱결제', 'In-App Purchase'),
    ('인앱결제', 'IAP')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. DevOps Keywords (확장)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- Container
    ('containerd', 'containerd'),
    ('containerd', '컨테이너디'),
    ('Podman', 'Podman'),
    ('Podman', '포드맨'),
    ('EKS', 'EKS'),
    ('EKS', '이케이에스'),
    ('EKS', 'Amazon EKS'),
    ('GKE', 'GKE'),
    ('GKE', '지케이이'),
    ('GKE', 'Google GKE'),
    ('AKS', 'AKS'),
    ('AKS', '에이케이에스'),
    ('AKS', 'Azure AKS'),
    ('OpenShift', 'OpenShift'),
    ('OpenShift', '오픈시프트'),
    ('Rancher', 'Rancher'),
    ('Rancher', '랜처'),
    ('Nomad', 'Nomad'),
    ('Nomad', '노매드'),
    ('Nomad', 'HashiCorp Nomad'),
    ('ECS', 'ECS'),
    ('ECS', '이씨에스'),
    ('ECS', 'Amazon ECS'),
    ('Fargate', 'Fargate'),
    ('Fargate', '파게이트'),

    -- CI/CD
    ('Flux', 'Flux'),
    ('Flux', '플럭스'),
    ('Flux', 'FluxCD'),
    ('Spinnaker', 'Spinnaker'),
    ('Spinnaker', '스피네이커'),
    ('Tekton', 'Tekton'),
    ('Tekton', '텍톤'),
    ('Harness', 'Harness'),
    ('Harness', '하네스'),
    ('GitOps', 'GitOps'),
    ('GitOps', '깃옵스'),
    ('Blue-Green', 'Blue-Green'),
    ('Blue-Green', '블루그린'),
    ('Blue-Green', 'Blue-Green Deployment'),
    ('Canary', 'Canary'),
    ('Canary', '카나리'),
    ('Canary', 'Canary Deployment'),

    -- IaC
    ('Pulumi', 'Pulumi'),
    ('Pulumi', '풀루미'),
    ('CloudFormation', 'CloudFormation'),
    ('CloudFormation', '클라우드포메이션'),
    ('CloudFormation', 'CFN'),
    ('CDK', 'CDK'),
    ('CDK', '씨디케이'),
    ('CDK', 'AWS CDK'),
    ('Packer', 'Packer'),
    ('Packer', '패커'),
    ('Vagrant', 'Vagrant'),
    ('Vagrant', '베이그런트'),
    ('Crossplane', 'Crossplane'),
    ('Crossplane', '크로스플레인'),

    -- Monitoring
    ('Loki', 'Loki'),
    ('Loki', '로키'),
    ('Jaeger', 'Jaeger'),
    ('Jaeger', '예거'),
    ('Zipkin', 'Zipkin'),
    ('Zipkin', '집킨'),
    ('OpenTelemetry', 'OpenTelemetry'),
    ('OpenTelemetry', '오픈텔레메트리'),
    ('OpenTelemetry', 'OTel'),
    ('PagerDuty', 'PagerDuty'),
    ('PagerDuty', '페이저듀티'),
    ('Sentry', 'Sentry'),
    ('Sentry', '센트리'),
    ('Dynatrace', 'Dynatrace'),
    ('Dynatrace', '다이나트레이스'),
    ('Splunk', 'Splunk'),
    ('Splunk', '스플렁크'),
    ('ELK', 'ELK'),
    ('ELK', '엘크'),
    ('ELK', 'Elasticsearch, Logstash, Kibana')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. PM/Design Keywords (확장)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- PM
    ('Product Manager', 'Product Manager'),
    ('Product Manager', '프로덕트매니저'),
    ('Product Manager', 'PM'),
    ('Product Owner', 'Product Owner'),
    ('Product Owner', '프로덕트오너'),
    ('Product Owner', 'PO'),
    ('기획자', '기획자'),
    ('기획자', 'Planner'),
    ('기획자', '서비스기획자'),
    ('PRD', 'PRD'),
    ('PRD', '피알디'),
    ('PRD', 'Product Requirements Document'),
    ('OKR', 'OKR'),
    ('OKR', '오케이알'),
    ('OKR', 'Objectives Key Results'),
    ('KPI', 'KPI'),
    ('KPI', '케이피아이'),
    ('KPI', 'Key Performance Indicator'),
    ('A/B테스트', 'A/B테스트'),
    ('A/B테스트', 'A/B Test'),
    ('A/B테스트', 'AB테스트'),
    ('Agile', 'Agile'),
    ('Agile', '애자일'),
    ('Scrum', 'Scrum'),
    ('Scrum', '스크럼'),
    ('Kanban', 'Kanban'),
    ('Kanban', '칸반'),
    ('Notion', 'Notion'),
    ('Notion', '노션'),
    ('Linear', 'Linear'),
    ('Linear', '리니어'),

    -- UX/UI
    ('UX디자이너', 'UX디자이너'),
    ('UX디자이너', 'UX Designer'),
    ('UX디자이너', 'UXD'),
    ('UI디자이너', 'UI디자이너'),
    ('UI디자이너', 'UI Designer'),
    ('UI디자이너', 'UID'),
    ('프로덕트디자이너', '프로덕트디자이너'),
    ('프로덕트디자이너', 'Product Designer'),
    ('프로덕트디자이너', 'PD'),
    ('Framer', 'Framer'),
    ('Framer', '프레이머'),
    ('ProtoPie', 'ProtoPie'),
    ('ProtoPie', '프로토파이'),
    ('InVision', 'InVision'),
    ('InVision', '인비전'),
    ('와이어프레임', '와이어프레임'),
    ('와이어프레임', 'Wireframe'),
    ('프로토타입', '프로토타입'),
    ('프로토타입', 'Prototype'),
    ('프로토타입', '프로토타이핑'),
    ('사용성테스트', '사용성테스트'),
    ('사용성테스트', 'Usability Test'),
    ('사용성테스트', 'UT'),
    ('디자인씽킹', '디자인씽킹'),
    ('디자인씽킹', 'Design Thinking'),
    ('디자인스프린트', '디자인스프린트'),
    ('디자인스프린트', 'Design Sprint')
ON CONFLICT (variant) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. Job Title Keywords (한글 직책)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    -- Frontend
    ('프론트엔드개발자', '프론트엔드개발자'),
    ('프론트엔드개발자', 'Frontend Developer'),
    ('프론트엔드개발자', 'FE개발자'),
    ('프론트엔드개발자', '프론트엔드엔지니어'),
    ('웹개발자', '웹개발자'),
    ('웹개발자', 'Web Developer'),
    ('웹개발자', '웹퍼블리셔'),
    ('UI개발자', 'UI개발자'),
    ('UI개발자', 'UI Developer'),

    -- Backend
    ('백엔드개발자', '백엔드개발자'),
    ('백엔드개발자', 'Backend Developer'),
    ('백엔드개발자', 'BE개발자'),
    ('서버개발자', '서버개발자'),
    ('서버개발자', 'Server Developer'),
    ('서버개발자', '서버엔지니어'),
    ('API개발자', 'API개발자'),
    ('API개발자', 'API Developer'),

    -- Data
    ('데이터엔지니어', '데이터엔지니어'),
    ('데이터엔지니어', 'Data Engineer'),
    ('데이터엔지니어', 'DE'),
    ('데이터과학자', '데이터과학자'),
    ('데이터과학자', 'Data Scientist'),
    ('데이터과학자', 'DS'),
    ('데이터분석가', '데이터분석가'),
    ('데이터분석가', 'Data Analyst'),
    ('데이터분석가', 'DA'),
    ('ML엔지니어', 'ML엔지니어'),
    ('ML엔지니어', 'ML Engineer'),
    ('ML엔지니어', 'MLE'),
    ('AI엔지니어', 'AI엔지니어'),
    ('AI엔지니어', 'AI Engineer'),

    -- Mobile
    ('iOS개발자', 'iOS개발자'),
    ('iOS개발자', 'iOS Developer'),
    ('iOS개발자', '아이폰개발자'),
    ('Android개발자', 'Android개발자'),
    ('Android개발자', 'Android Developer'),
    ('Android개발자', '안드로이드개발자'),
    ('Android개발자', 'AOS개발자'),
    ('모바일개발자', '모바일개발자'),
    ('모바일개발자', 'Mobile Developer'),
    ('모바일개발자', '앱개발자'),

    -- DevOps
    ('DevOps엔지니어', 'DevOps엔지니어'),
    ('DevOps엔지니어', 'DevOps Engineer'),
    ('DevOps엔지니어', '데브옵스'),
    ('인프라엔지니어', '인프라엔지니어'),
    ('인프라엔지니어', 'Infra Engineer'),
    ('인프라엔지니어', '인프라개발자'),
    ('클라우드엔지니어', '클라우드엔지니어'),
    ('클라우드엔지니어', 'Cloud Engineer'),
    ('클라우드엔지니어', '클라우드개발자'),
    ('플랫폼엔지니어', '플랫폼엔지니어'),
    ('플랫폼엔지니어', 'Platform Engineer'),

    -- Seniority
    ('시니어', '시니어'),
    ('시니어', 'Senior'),
    ('시니어', 'Sr'),
    ('시니어', 'Sr.'),
    ('주니어', '주니어'),
    ('주니어', 'Junior'),
    ('주니어', 'Jr'),
    ('주니어', 'Jr.'),
    ('주니어', '신입'),
    ('리드', '리드'),
    ('리드', 'Lead'),
    ('리드', '팀장'),
    ('리드', '테크리드'),
    ('리드', 'Tech Lead'),
    ('풀스택', '풀스택'),
    ('풀스택', 'Fullstack'),
    ('풀스택', 'Full-stack'),
    ('풀스택', '풀스택개발자'),
    ('아키텍트', '아키텍트'),
    ('아키텍트', 'Architect'),
    ('아키텍트', '설계자')
ON CONFLICT (variant) DO NOTHING;

-- 코멘트
COMMENT ON TABLE skill_synonyms IS
'스킬 동의어 매핑 테이블. PM 직군별 키워드 600개 기반 확장.';

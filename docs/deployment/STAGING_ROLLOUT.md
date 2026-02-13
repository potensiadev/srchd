# RAI Worker 스테이징 롤아웃 계획

## 개요

이 문서는 RAI Worker의 스테이징 환경 배포 및 점진적 롤아웃 계획을 설명합니다.

---

## 1. Feature Flag 기반 롤아웃 단계

### Phase 1: 내부 테스트 (0%)
```bash
# 모든 새 기능 비활성화
USE_NEW_PIPELINE=false
NEW_PIPELINE_ROLLOUT_PERCENTAGE=0.0
USE_LLM_VALIDATION=false
USE_AGENT_MESSAGING=false
```

**목표:**
- 기존 파이프라인으로 스테이징 환경 안정성 확인
- 인프라 (Redis, Supabase) 연결 검증
- 기본 헬스체크 통과

**체크리스트:**
- [ ] Docker 이미지 빌드 성공
- [ ] 컨테이너 정상 시작
- [ ] `/health` 엔드포인트 응답
- [ ] Redis 연결 확인
- [ ] Supabase 연결 확인

---

### Phase 2: 특정 사용자 테스트 (화이트리스트)
```bash
USE_NEW_PIPELINE=true
NEW_PIPELINE_ROLLOUT_PERCENTAGE=0.0
NEW_PIPELINE_USER_IDS=user-id-1,user-id-2,user-id-3
DEBUG_PIPELINE=true
```

**목표:**
- 내부 QA 팀 대상 새 파이프라인 테스트
- 상세 로깅으로 문제 조기 발견
- 기존 사용자에게 영향 없음

**체크리스트:**
- [ ] 화이트리스트 사용자의 요청이 새 파이프라인으로 라우팅
- [ ] 다른 사용자는 기존 파이프라인 사용
- [ ] `/feature-flags/check?user_id=xxx` API로 라우팅 확인
- [ ] 파이프라인 완료율 100%
- [ ] 에러 로그 확인 및 수정

---

### Phase 3: 점진적 롤아웃 (10%)
```bash
USE_NEW_PIPELINE=true
NEW_PIPELINE_ROLLOUT_PERCENTAGE=0.1
DEBUG_PIPELINE=false
```

**목표:**
- 전체 트래픽의 10%를 새 파이프라인으로 처리
- A/B 비교를 통한 성능 검증
- 이상 징후 시 즉시 롤백 준비

**체크리스트:**
- [ ] `/metrics` API에서 `requests_by_pipeline_type` 비율 확인
- [ ] 새 파이프라인 에러율 < 5%
- [ ] 평균 처리 시간 기존 대비 ±20% 이내
- [ ] LLM 비용 예상 범위 이내

---

### Phase 4: 확대 롤아웃 (50%)
```bash
USE_NEW_PIPELINE=true
NEW_PIPELINE_ROLLOUT_PERCENTAGE=0.5
USE_LLM_VALIDATION=true
```

**목표:**
- 절반의 트래픽에서 새 파이프라인 안정성 확인
- LLM 검증 기능 활성화

**체크리스트:**
- [ ] 새 파이프라인 에러율 < 3%
- [ ] 사용자 피드백 수집
- [ ] 성능 메트릭 기준 충족
- [ ] 24시간 이상 안정 운영

---

### Phase 5: 전체 롤아웃 (100%)
```bash
USE_NEW_PIPELINE=true
NEW_PIPELINE_ROLLOUT_PERCENTAGE=1.0
USE_LLM_VALIDATION=true
USE_AGENT_MESSAGING=true
USE_HALLUCINATION_DETECTION=true
USE_EVIDENCE_TRACKING=true
```

**목표:**
- 모든 트래픽을 새 파이프라인으로 처리
- 모든 기능 활성화

**체크리스트:**
- [ ] 새 파이프라인 에러율 < 1%
- [ ] 모든 기능 정상 동작
- [ ] 기존 파이프라인 코드 제거 준비

---

## 2. 모니터링 체크리스트

### 헬스체크 엔드포인트
```bash
# 기본 헬스체크
curl http://localhost:8000/health

# 상세 헬스체크 (의존성 포함)
curl http://localhost:8000/health?detailed=true
```

### 메트릭 모니터링
```bash
# 전체 메트릭 (최근 1시간)
curl http://localhost:8000/metrics?minutes=60

# 메트릭 기반 헬스 상태
curl http://localhost:8000/metrics/health

# LLM 비용 메트릭
curl http://localhost:8000/metrics/llm-cost?minutes=1440
```

### Feature Flag 상태 확인
```bash
# 현재 플래그 상태
curl http://localhost:8000/feature-flags

# 특정 요청의 라우팅 확인
curl "http://localhost:8000/feature-flags/check?user_id=xxx&job_id=yyy"
```

### 주요 모니터링 지표

| 지표 | 정상 범위 | 경고 임계값 | 위험 임계값 |
|------|----------|------------|------------|
| 에러율 | < 1% | 5% | 10% |
| 평균 처리 시간 | < 30s | 60s | 120s |
| Redis 연결 | healthy | degraded | unhealthy |
| LLM API 응답 | < 10s | 20s | 30s |
| 메모리 사용량 | < 70% | 80% | 90% |

### Sentry 모니터링
- 에러 발생 시 즉시 알림 설정
- 에러 그룹화 및 트렌드 분석
- 성능 트레이싱 활성화

---

## 3. 롤백 절차

### 즉시 롤백 (환경 변수 변경)
```bash
# 새 파이프라인 완전 비활성화
docker exec rai-worker-staging sh -c "export USE_NEW_PIPELINE=false"

# 또는 docker-compose 재시작
USE_NEW_PIPELINE=false docker-compose -f docker-compose.staging.yml up -d worker
```

### 부분 롤백 (롤아웃 비율 감소)
```bash
# 롤아웃 비율을 0%로 변경
NEW_PIPELINE_ROLLOUT_PERCENTAGE=0.0 docker-compose -f docker-compose.staging.yml up -d worker
```

### Feature Flag 런타임 재로드
```bash
# 환경 변수 변경 후 런타임 재로드 (컨테이너 재시작 없이)
curl -X POST http://localhost:8000/feature-flags/reload
```

### 전체 롤백 (이전 버전으로)
```bash
# 이전 이미지로 롤백
docker-compose -f docker-compose.staging.yml down
docker pull rai-worker:previous-version
docker tag rai-worker:previous-version rai-worker:staging
docker-compose -f docker-compose.staging.yml up -d
```

---

## 4. 배포 명령어

### 초기 배포
```bash
cd apps/worker

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 빌드 및 시작
docker-compose -f docker-compose.staging.yml build
docker-compose -f docker-compose.staging.yml up -d

# 로그 확인
docker-compose -f docker-compose.staging.yml logs -f worker
```

### 업데이트 배포
```bash
# 새 이미지 빌드
docker-compose -f docker-compose.staging.yml build worker

# 롤링 업데이트
docker-compose -f docker-compose.staging.yml up -d --no-deps worker
```

### 상태 확인
```bash
# 컨테이너 상태
docker-compose -f docker-compose.staging.yml ps

# 헬스체크
curl http://localhost:8000/health?detailed=true

# 디버그 정보 (스테이징 환경에서만)
curl http://localhost:8000/debug
```

---

## 5. 트러블슈팅

### Redis 연결 실패
```bash
# Redis 컨테이너 상태 확인
docker-compose -f docker-compose.staging.yml exec redis redis-cli ping

# Redis 로그 확인
docker-compose -f docker-compose.staging.yml logs redis
```

### Supabase 연결 실패
```bash
# 환경 변수 확인
docker-compose -f docker-compose.staging.yml exec worker env | grep SUPABASE

# 네트워크 연결 테스트
docker-compose -f docker-compose.staging.yml exec worker curl -I https://your-project.supabase.co
```

### LLM API 오류
```bash
# 메트릭에서 LLM 호출 상태 확인
curl http://localhost:8000/metrics/llm-cost

# 특정 프로바이더 상태
curl http://localhost:8000/debug | jq '.llm_status'
```

### 메모리 부족
```bash
# 컨테이너 리소스 사용량
docker stats rai-worker-staging

# 메모리 제한 증가 (docker-compose.yml 수정 후)
docker-compose -f docker-compose.staging.yml up -d worker
```

---

## 6. 비상 연락처

| 역할 | 담당자 | 연락처 |
|------|--------|--------|
| DevOps | TBD | TBD |
| Backend | TBD | TBD |
| PM | TBD | TBD |

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-01-31 | 1.0 | 초안 작성 |

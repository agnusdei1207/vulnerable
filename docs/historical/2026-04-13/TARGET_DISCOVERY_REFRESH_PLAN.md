# PLAN: target discovery refresh and live deploy

[작성 시각: 2026-04-13 17:27:45]
[모델: GPT-5 Codex]

범위: `blue` 실서버의 target surface가 사실상 탐색 불가한 원인을 코드/배포 기준으로 수정하고, `red`와 `blue target`을 최신 이미지로 재배포해 live host 반영까지 확인한다. 왜: 현재 blue target은 `vuln-web` 컨테이너가 떠 있어도 외부 프록시에서 도달할 수 없고, silver challenge router 인덱스도 40개 중 12개만 노출해 취약점 탐색 난이도가 비정상적으로 높다.

파일:
- `vulnerable-app/proxy/nginx.conf`
- `vulnerable-app/proxy/index.html`
- `AGENT_MEMORY.md`

순서:
1. Phase A - proxy exposure gap 수정
2. Phase B - landing page discovery gap 수정
3. Phase C - build / deploy / live verification

위험:
- `/app/` 프록시 추가 시 기존 silver route location보다 우선순위가 높으면 route shadowing이 생길 수 있다.
- 루트 랜딩 페이지를 바꾸며 기존 운영자의 빠른 이동 링크가 사라지면 오히려 사용성이 떨어질 수 있다.
- 실서버 deploy 중 registry pull 실패나 원격 디스크 부족이 다시 발생할 수 있다.

롤백:
- nginx 변경은 `/app/` 전용 location과 root index 변경만 포함한다.
- live 회귀 시 `vulnerable-app/proxy/nginx.conf`와 `vulnerable-app/proxy/index.html`만 되돌리고 blue 이미지를 재배포한다.
- registry pull 실패 시 `LOAD_LOCAL_IMAGES=true` 경로로 재배포한다.

완료조건:
- `web` 프록시에서 `/app/` 경로로 `vuln-web` 메인 앱에 도달할 수 있다.
- 프록시 루트 페이지가 실제 배포되는 40개 silver route 전체를 노출하고, 메인 앱 진입점도 명시한다.
- `red`와 `blue target` 모두 live host에서 최신 이미지/컨테이너 재기동이 확인된다.
- 변경 후 검증 명령의 최종 exit code가 0이고, live HTTP 확인이 성공한다.

구현율 기준:
- 구현 100% 분모 = 아래 5개 마이크로태스크
- 검증 100% 분모 = 아래 6개 검증 항목

## Phase A - Proxy Exposure Gap

- [x] A-1. `vulnerable-app/proxy/nginx.conf`: `vuln-web` upstream를 추가하고 `/app` + `/app/` 경로를 메인 vulnerable app으로 proxy
- [x] A-2. `vulnerable-app/proxy/nginx.conf`: 기존 `^~ /{slug}/silver` route보다 안전하게 공존하는지 location ordering 재검토

## Phase B - Landing Page Discovery Gap

- [x] B-1. `vulnerable-app/proxy/index.html`: 40개 silver route 전체 링크 복원
- [x] B-2. `vulnerable-app/proxy/index.html`: `/app/`, `/app/__console`, `/healthz` 등 operator/agent용 discovery entrypoint 추가
- [x] B-3. `vulnerable-app/proxy/index.html`: 현재 노출 surface 설명과 탐색 우선순위(메인 앱 vs isolated silver)를 짧게 명시

## Phase C - Build, Deploy, Verify

- [x] C-1. `red` 최신 deploy 상태 재확인 및 필요 시 재배포
- [x] C-2. `blue target` 이미지 재빌드 / 재배포
- [x] C-3. live host에서 `/`, `/app/`, silver route 샘플, red UI 포트 상태 확인

시나리오 매트릭스:
- [x] Happy path: 진입점=`/app/`, 트리거=메인 vulnerable app 접속, 기대 관찰값=shop/app 응답, 검증 수단=`curl -I` + body 확인
- [x] Discovery path: 진입점=`/`, 트리거=router landing open, 기대 관찰값=40 challenge link + `/app/` entry 노출, 검증 수단=`curl`
- [x] Existing route preservation: 진입점=`/sqli/silver`, 트리거=기존 silver route 접속, 기대 관찰값=기존 challenge page 유지, 검증 수단=`curl`
- [x] Error path: 진입점=deploy, 트리거=registry pull 실패, 기대 관찰값=`LOAD_LOCAL_IMAGES=true` fallback 적용, 검증 수단=deploy log

검증 계획:
- [x] `bash scripts/run-hardening-gates.sh`
- [x] `docker build -f vulnerable-app/proxy/Dockerfile -t lepisoderegistry/vuln-proxy:latest vulnerable-app/proxy`
- [x] `curl -I --max-time 10 http://133.186.241.232:3000`
- [x] `curl --max-time 10 http://133.186.241.232:3000 | head`
- [x] `curl --max-time 10 http://133.186.241.232:3000/app/ | head`
- [x] `curl --max-time 10 http://133.186.241.232:3000/sqli/silver | head`

근거 요약:
- [DISCOVERY: deployed blue target hid the main app and underindexed silver routes] `deploy-target-blue-remote.sh`는 `vuln-web`를 함께 띄우지만 기존 `vulnerable-app/proxy/nginx.conf`는 `/` 정적 index와 40개 silver route만 proxy했고, 기존 `vulnerable-app/proxy/index.html`은 그중 12개만 노출했다.

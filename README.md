# 2000 회귀 주식게임 — Render 온라인 MVP

이 프로젝트는 기존 브라우저 게임에 **회원가입/로그인, 서버 게임 저장, 리더보드**를 붙인 MVP입니다. Render Web Service + PostgreSQL로 배포할 수 있습니다.

## 포함 기능
- 아이디/비밀번호 회원가입 및 로그인 (bcrypt 해시, JWT 세션)
- 월, 현금, 보유 종목, 최근 거래 내역을 PostgreSQL에 저장
- 저장된 게임 복원
- 유저별 평가자산/수익률 리더보드
- 공개방/비밀번호 방 생성 및 참가
- 방 정원 설정, 참가자 목록 및 자동 인원 갱신(5초 폴링)
- 20초 이상 heartbeat가 끊긴 사용자는 비접속자로 계산
- API rate limit, 기본 보안 헤더, 입력 검증
- `render.yaml` Blueprint 설정

## Render 배포
1. 이 프로젝트를 GitHub 저장소에 올립니다.
2. Render 대시보드에서 **New → Blueprint**를 선택하고 저장소를 연결합니다.
3. `render.yaml`의 Web Service와 PostgreSQL 생성 설정을 확인하고 배포합니다.
4. Render가 `DATABASE_URL`과 `JWT_SECRET`을 연결하도록 합니다. `JWT_SECRET`은 랜덤 비밀값으로 자동 생성됩니다.
5. 배포 후 `https://<서비스 주소>/api/health`가 `{"ok":true,"database":"connected"}`를 반환하는지 확인합니다.

수동 생성 시에는 Node Web Service를 만들고 Build Command=`npm install`, Start Command=`npm start`로 설정합니다. 같은 PostgreSQL 인스턴스의 Internal Database URL을 `DATABASE_URL`에 넣고, `JWT_SECRET`은 길고 무작위인 값으로 설정합니다. `TRUST_PROXY=1`도 설정합니다.

## 종목 데이터 주의
`public/index.html`은 기존 데이터 패키지 로딩 방식을 유지합니다. 게임을 시작하려면 기존 `retro_stock_game_data.zip`을 내려받아 압축 해제하고, 화면에서 `universe.csv`와 `prices/` 폴더가 포함된 데이터 폴더를 선택해야 합니다. 온라인 사용자 모두가 이 파일을 개별적으로 받아야 하므로, 공개 서비스 전에는 데이터를 오브젝트 스토리지/CDN에 올리고 서버가 제공하거나 데이터 API를 구현하는 작업이 필요합니다.

## 현재 리더보드의 신뢰 수준 — 꼭 읽기
이 버전은 브라우저가 계산한 현금/보유종목/평가자산/수익률을 API로 제출합니다. 로그인·저장·리더보드 동작은 가능하지만, 브라우저를 조작해 점수를 위조할 수 있으므로 **공식 경쟁이나 보상에 사용할 수 있는 치트 방지형 랭킹은 아닙니다.** 실제 대회 전에 반드시 다음을 구현해야 합니다.
- 서버가 월별 가격 데이터를 보유하고 거래 주문을 서버에서 검증
- 서버에서 현금/수량/수익률을 직접 계산하며 클라이언트의 equity/returnPct 값을 신뢰하지 않음
- 과거 월로 임의 이동하거나 이미 지나간 달에서 매매하는 행위를 서버에서 제한
- 거래 및 월 진행의 트랜잭션/멱등성, 감사 로그, 비정상 계정 탐지
- 데이터 호스팅/CDN, 백업, DB 용량/요금 정책 확인

## API
- `POST /api/auth/register` — `{ "username": "player1", "password": "at-least-8-chars" }`
- `POST /api/auth/login` — 로그인
- `GET /api/me` — 현재 계정 (Bearer token)
- `GET /api/state` — 저장된 게임 (Bearer token)
- `PUT /api/state` — 게임 상태 저장 및 리더보드 갱신 (Bearer token)
- `GET /api/leaderboard` — 전체 리더보드, 선택적으로 `?month=2000-01`
- `GET /api/rooms` — 대기방 목록 (로그인 필요)
- `POST /api/rooms` — `{"name":"방 이름","password":"선택","maxPlayers":8}` 방 생성
- `POST /api/rooms/:id/join` — `{"password":"선택"}` 방 참가
- `POST /api/rooms/:id/heartbeat` — 접속 유지 및 방 참가자 현황 반환
- `POST /api/rooms/:id/leave` — 방 나가기
- `GET /api/rooms/:id` — 방 상태/참가자 조회
- `GET /api/health` — 헬스 체크

## 로컬 실행
Node.js 20 이상과 PostgreSQL이 필요합니다.

```bash
npm install
# DATABASE_URL, JWT_SECRET 환경변수 설정
npm start
```

방 참가 인원은 클라이언트 heartbeat를 5초마다 보내며, 서버는 20초 이상 heartbeat가 없는 플레이어를 오프라인으로 계산합니다. 브라우저가 갑자기 종료된 경우 인원 수 반영까지 최대 약 20초가 걸릴 수 있습니다. 방/계정 API는 MVP이며, 정식 경쟁 전에는 서버 권위형 매매 및 게임 시작/방장 권한 검증을 추가해야 합니다.

게임 시뮬레이션 전용이며 실제 투자/주문 기능이 아닙니다.


## 단타 대결 이벤트
- 단타 전용 토큰은 `daytrade_entries`에 별도로 기록되며, 기존 게임 현금과 분리됩니다.
- 이벤트 시작 시점에 등록된 전체 계정을 자동 참가자로 스냅샷합니다. 이벤트 시작 후 생성된 계정은 해당 경기에 소급 참가하지 않습니다.
- 풀매수/풀매도만 가능하며 가상 종목 가격 경로는 서버에서 결정되어 모든 참가자에게 동일하게 적용됩니다. 기본 진행 시간은 30초, 시작 토큰은 10,000입니다. 이벤트 중에는 팝업이 자동으로 열리고, 종료 시 서버가 정산한 뒤 최종 순위를 5초간 공개하고 팝업이 닫힙니다.
- 종료 시 최종 평가액과 수익률을 계산합니다. 공동 1등은 각자 경기 시작 전 총자산의 50%를 기존 게임 현금으로 받습니다. 경기 종료 후 단타 토큰은 이벤트 기록과 분리되어 사용 불가능하며 보상 재화로 전환되지 않습니다.
- 이벤트는 관리자 키로 시작합니다. Render 환경변수 `EVENT_ADMIN_KEY` 값을 확인한 뒤 다음 요청을 보냅니다.

```bash
curl -X POST https://YOUR-SERVICE.onrender.com/api/daytrade/admin/start \
  -H 'Content-Type: application/json' \
  -H 'x-event-admin-key: YOUR_EVENT_ADMIN_KEY' \
  -d '{"durationSeconds":30,"tokenGrant":10000,"assetName":"RETRO COIN"}'
```

- `GET /api/daytrade/current` (로그인 필요): 이벤트 상태, 내 단타 잔액, 순위
- `POST /api/daytrade/order` (로그인 필요): `{"action":"buy"}` 또는 `{"action":"sell"}`
- 관리자 키는 공개 저장소나 프런트엔드 코드에 넣지 마세요.
- **주의:** 이 MVP는 기존 게임의 `game_states.equity`를 시작 자산 스냅샷으로 사용합니다. 기존 게임의 현금/보유 종목 평가액은 현재 브라우저에서 제출될 수 있으므로, 실제 현금성 보상이나 고위험 공개 대회 전에 메인 게임의 매매·자산 평가도 서버 권위형으로 바꿔야 합니다. 서버는 1초마다 종료 시각이 지난 이벤트를 확인해 자동 정산합니다. Render 인스턴스가 중지된 시간에는 실행되지 않으며, 다시 시작되면 정산 sweep이 이어집니다.


## 60초 오프라인 정리 규칙
- 로그인 상태의 브라우저는 10초마다 `/api/presence/heartbeat`를 호출합니다.
- 서버에서 60초 동안 heartbeat가 없으면 해당 계정을 오프라인으로 간주하고 `leaderboard`, `game_finishes`, `daytrade_entries`, `room_members`, `user_presence`에서 기록을 삭제합니다. 계정과 저장된 기본 포트폴리오는 유지합니다.
- 온라인 참가자가 0명인 방은 서버 정리 작업에서 삭제됩니다. 방 인원수도 60초 기준으로 계산합니다.
- 정리 작업은 서버에서 5초마다 실행되므로, 실제 삭제 시점은 오프라인 전환 60초 후부터 추가로 최대 약 5초 지연될 수 있습니다. 서버가 완전히 중지된 동안에는 정리 작업이 실행되지 않으며, 재시작 후 다시 실행됩니다.


## 월 전환 및 팝업 순서
- 다음 달로 진행하거나 월 선택을 바꾸면 해당 연도·월이 전체 화면에 1초 표시됩니다.
- 이어서 해당 월의 가상 뉴스 팝업이 열리며, 닫기 버튼으로 닫을 수 있습니다.
- 단타 이벤트 팝업은 뉴스 팝업보다 위에 표시됩니다. 30초 종료 후 자동 정산하고 최종 순위를 5초 공개한 다음 자동으로 닫힙니다.
- 단타 가격은 모든 참가자에게 동일한 5초 단위 서버 가격 경로를 적용합니다.

## 월별 JSON 데이터 구조

- `public/data/index.json`: 데이터 범위 및 월 목록
- `public/data/universe.json`: 전체 16,013개 자산 메타데이터
- `public/data/prices/YYYY-MM.json`: 월별 종가 데이터 (`asset_id`, `currency`, `close`)
- 가격 데이터는 2000-01부터 2026-09까지 321개월, 총 2,021,232행입니다.
- 브라우저는 시작 시 인덱스·종목 목록·첫 달 데이터만 요청합니다. 다음 달로 이동할 때 해당 월 JSON을 fetch하고, 클라이언트는 현재 월 데이터만 메모리에 유지합니다.
- 매매, 보유 평가액, 수익률은 브라우저에서 계산합니다. 서버는 정적 파일 제공과 계정/상태 저장을 담당합니다.
- CSV 변환은 사전 처리 단계이며, 앱 실행 시 CSV 전체를 다운로드하거나 파싱하지 않습니다.

자산 유형은 CSV의 `asset_class` 값으로 구분하며, UI에는 한국어 라벨을 표시합니다. 미등록 유형이 생기면 원래 코드를 fallback으로 표시하도록 했습니다.


## 기본 캐릭터 이미지
- `public/avatars/avatar-01.webp` ~ `avatar-26.webp`에 기본 캐릭터 이미지 26개를 포함합니다.
- 최초 방문 시 브라우저에서 무작위 캐릭터를 배정하고 `localStorage`에 저장해 새로고침 후에도 유지합니다.
- 상단의 `랜덤 변경` 버튼으로 다른 캐릭터를 선택할 수 있습니다.
- 최종 순위 공개 화면에도 사용자명 기준으로 일관된 캐릭터 이미지를 표시합니다.
- 별도 배경 이미지는 아직 적용하지 않았으며, 추후 배경을 추가할 수 있도록 캐릭터 영역을 분리했습니다.

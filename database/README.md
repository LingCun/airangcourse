# 아이랑코스 MariaDB 데이터베이스

MariaDB 11.4 기준의 초기 스키마입니다. 마이그레이션은 체크섬과 적용 이력을 기록하며 파일명 순서대로 한 번씩 실행합니다.

```powershell
Copy-Item .env.example .env
docker compose up -d mariadb
$env:DATABASE_URL='mariadb://airangcourse:airangcourse@localhost:3306/airangcourse'
npm run db:migrate
npm run db:status
```

운영 환경에서는 `.env` 파일을 배포하지 않고 비밀 관리 도구에서 `DATABASE_URL`을 주입합니다. 이미 적용된 SQL 파일의 내용이 달라지면 마이그레이션 실행기가 체크섬 불일치로 중단합니다. 변경은 반드시 다음 번호의 파일로 추가합니다.

## 로그인 담당자 연동 계약

OAuth 콜백에서 공급자별 불변 식별자를 사용합니다.

| 공급자 | `provider` | `provider_subject` |
|---|---|---|
| Google | `google` | ID Token의 `sub` |
| NAVER | `naver` | 프로필 API 응답의 `response.id` |

현재 `api/auth.js`가 만드는 `{provider, id, name, email, picture}` 객체는 `findOrCreateSocialUser()`에 그대로 전달할 수 있습니다. 구현은 `database/auth-repository.mjs`에 있으며 신규 사용자의 기본 가족까지 같은 트랜잭션에서 생성합니다. 로그인 성공 뒤 `createSession()`이 반환한 원문 token만 HttpOnly 쿠키에 전달하고, DB에는 SHA-256 해시만 남깁니다.

로그인 트랜잭션은 다음 순서로 처리합니다.

1. `oauth_states`의 해시가 존재하고 만료·소비되지 않았는지 잠금 조회합니다.
2. 공급자 서버에서 코드를 교환하고 토큰/프로필을 검증합니다.
3. `(provider, provider_subject)`로 `auth_identities`를 조회합니다.
4. 기존 identity면 사용자와 `last_login_at`을 갱신합니다.
5. 신규 identity면 `users`, `auth_identities`, 기본 `families`를 하나의 트랜잭션에서 생성합니다.
6. 무작위 refresh token 원문은 클라이언트 쿠키로만 보내고 DB에는 SHA-256 등 안전한 해시만 `user_sessions.refresh_token_hash`에 저장합니다.
7. `oauth_states.consumed_at`을 기록하고 커밋합니다.

이메일은 변경되거나 공급자마다 다를 수 있으므로 로그인 키로 사용하지 않습니다. 같은 이메일을 가진 Google/NAVER 계정을 자동 병합하지 말고, 로그인된 사용자가 별도의 계정 연결 절차를 완료했을 때만 기존 `user_id`에 identity를 추가합니다. OAuth access/refresh token은 현재 서비스 기능에 필요하지 않으므로 DB에 저장하지 않습니다. 추후 외부 API 호출에 필요해지면 KMS로 암호화한 별도 token vault를 추가합니다.

계정 연결 해제 API는 해당 사용자의 identity 행을 잠근 뒤 최소 한 개의 로그인 수단이 남는지 확인하고 삭제해야 합니다. 이 검사는 회원 탈퇴의 연쇄 삭제를 방해하지 않도록 DB 삭제 트리거가 아니라 서비스 트랜잭션에서 수행합니다.

## 도메인 구조

- `users` / `auth_identities` / `user_sessions`: 계정, 다중 소셜 로그인, 세션
- `families` / `family_members` / `children` / `family_preferences`: 가족과 아이 프로필
- `places` / `place_hours` / `place_facilities`: 장소 원본과 검증 가능한 편의시설
- `courses` / `course_stops`: 저장 코스와 당시 장소 스냅샷
- `favorite_places`: 찜한 장소
- `consent_records`: 약관·개인정보 동의 이력

`course_stops`는 `place_id` 외에 이름과 좌표 스냅샷을 보관합니다. 장소 정보가 나중에 바뀌거나 삭제되어도 사용자가 저장한 과거 코스가 깨지지 않게 하기 위한 구조입니다.

## 운영 원칙

- API에서 모든 사용자 소유 데이터 조회에 인증된 `user_id` 조건을 붙입니다.
- 탈퇴는 먼저 `users.status = 'deleted'`, `deleted_at = now()`로 바꾸고 세션을 전부 폐기합니다. 법적 보존기간이 끝난 뒤 별도 작업으로 개인정보를 익명화하거나 삭제합니다.
- 만료된 `oauth_states`와 `user_sessions`는 정기 작업으로 제거합니다.
- 장소 검색량과 반경 검색이 커지면 MariaDB `POINT`와 `SPATIAL INDEX`를 추가합니다. MVP에서는 의존성을 줄이기 위해 숫자 좌표와 복합 인덱스를 사용합니다.
- 마이그레이션은 적용 후 수정하지 않고 새 번호 파일로 변경합니다.

## 주요 API 데이터 매핑

현재 화면 상태는 다음처럼 저장하면 됩니다.

| 화면 데이터 | DB |
|---|---|
| 성인 수, 이동 보조수단 | `families` |
| 아이 나이 | `children.birth_year`, `birth_month` |
| 실내·가성비·역할놀이 | `family_preferences` |
| 지역·날짜·시간·예산·교통 | `courses` |
| 출발지와 방문 순서 | `course_stops.position`, `kind` |
| 네이버 장소 | `places.naver_place_id` |

연령은 시간이 지나면 달라지므로 DB에는 고정 나이 대신 생년·생월을 저장합니다. 날짜를 모르는 임시 입력은 코스 생성 당시의 나이를 `courses.input_snapshot`에 보존할 수 있습니다.

## 구현된 API

| 경로 | 메서드 | 기능 |
|---|---|---|
| `/api/family` | `GET`, `PUT` | 가족·아이·취향 조회 및 저장 |
| `/api/places` | `GET` | 활성 장소와 편의시설 조회 |
| `/api/courses` | `GET`, `POST` | 내 코스 목록 및 코스 저장 |
| `/api/favorites` | `GET`, `POST`, `DELETE` | 찜 목록·추가·삭제 |

모든 API는 `airang_session` 쿠키의 원문 세션 토큰을 해시해 `user_sessions`에서 확인합니다. 현재 별도로 작업 중인 로그인 API가 `findOrCreateSocialUser()`와 `createSession()`을 호출해 이 쿠키를 발급하면 연결이 완료됩니다.

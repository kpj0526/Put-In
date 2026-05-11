# 충전기 타이밍 게임 Backend

NestJS, PostgreSQL, TypeORM 기반 API 서버입니다.

## 주요 기능

- 이메일 회원가입
- 이메일 인증 메일 발송
- 이메일 로그인
- JWT access token 인증
- HttpOnly cookie 기반 refresh token
- refresh token rotation
- 리더보드 기록 저장
- 리더보드 상위 10개 조회

## 환경 변수

`.env.example`을 참고해 `.env`를 생성합니다.

```bash
cp .env.example .env
```

개발용 기본값:

```env
PORT=3000
CLIENT_ORIGIN=http://localhost:5173

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=charger_game
DB_SYNC=true

JWT_ACCESS_SECRET=change-this-access-secret
JWT_REFRESH_SECRET=change-this-refresh-secret
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=14d
JWT_REFRESH_EXPIRES_MS=1209600000

EMAIL_VERIFICATION_EXPIRES_MS=1800000
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=Plug Rush <no-reply@plugrush.local>
```

`SMTP_HOST`가 비어 있으면 개발 편의를 위해 인증 링크를 서버 로그에 출력하고 메일은 발송하지 않습니다.

## 실행

```bash
pnpm install
pnpm run start:dev
```

API base URL:

```text
http://localhost:3000/api
```

## 빌드

```bash
pnpm run build
```

## PostgreSQL

개발 환경에서는 `DB_SYNC=true`로 TypeORM이 테이블을 자동 생성하게 할 수 있습니다.

운영 환경에서는 `DB_SYNC=false`로 두고 migration을 사용하는 방식으로 전환해야 합니다.

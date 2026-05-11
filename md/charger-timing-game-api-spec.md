# 충전기 타이밍 게임 MVP API 명세서

## 1. API 개요

충전기 타이밍 게임 MVP에서 사용하는 서버 API 명세이다.

MVP API의 목적은 이메일 기반 회원가입/로그인, JWT 인증, 플레이 결과 저장, 리더보드 조회를 제공하는 것이다.

## 2. 공통 규칙

### Base URL

```text
/api
```

### 인증 방식

- 인증은 JWT access token과 refresh token을 사용한다.
- access token은 API 인증에 사용한다.
- refresh token은 access token 재발급에 사용한다.
- access token 만료 시간은 15분이다.
- refresh token 만료 시간은 14일이다.
- refresh token은 DB에 원문 저장하지 않고 해시로 저장한다.
- refresh token 재발급 시 기존 refresh token은 폐기하고 새 refresh token을 발급한다.

### Token 전달 방식

```http
Authorization: Bearer <accessToken>
```

refresh token은 HttpOnly cookie로 전달한다.

```http
Set-Cookie: refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=1209600
```

개발 환경에서는 HTTPS가 없을 수 있으므로 `Secure` 옵션은 환경에 따라 비활성화할 수 있다.

### Response Format

성공 응답은 아래 형식을 기본으로 한다.

```json
{
  "success": true,
  "data": {}
}
```

실패 응답은 아래 형식을 기본으로 한다.

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청 값이 올바르지 않습니다.",
    "details": [
      {
        "field": "email",
        "reason": "올바른 이메일 형식이어야 합니다."
      }
    ]
  }
}
```

`details`는 필요한 경우에만 포함한다.

### Date Format

- 모든 날짜는 ISO 8601 문자열로 내려준다.
- 예시: `2026-05-11T00:00:00.000Z`

## 3. 입력 검증 규칙

### Email

- 올바른 이메일 형식이어야 한다.
- 최대 255자까지 허용한다.
- 저장과 비교 시 소문자로 정규화한다.

### Password

- 8~64자여야 한다.
- 영문 대문자 1개 이상을 포함해야 한다.
- 영문 소문자 1개 이상을 포함해야 한다.
- 숫자 1개 이상을 포함해야 한다.
- 특수문자 1개 이상을 포함해야 한다.
- 서버에는 bcrypt 또는 argon2 해시로 저장한다.

### Nickname

- 2~12자여야 한다.
- 한글, 영문, 숫자만 허용한다.
- 앞뒤 공백은 제거한다.
- 금칙어 목록에 포함된 단어는 사용할 수 없다.
- MVP에서는 닉네임 중복을 허용하지 않는다.

### Accuracy

- 0~100 사이의 정수여야 한다.
- 서버는 `accuracy` 기준으로 `judgement`를 직접 계산한다.

## 4. 공통 에러 정책

### Error Code 목록

| HTTP Status | Error Code | 발생 상황 | 클라이언트 처리 방법 |
| --- | --- | --- | --- |
| 400 | VALIDATION_ERROR | 요청 body 또는 query 값이 검증 규칙에 맞지 않음 | 입력값을 수정하도록 안내한다. |
| 400 | INVALID_JSON | JSON 형식이 잘못됨 | 요청 데이터를 다시 생성해 전송한다. |
| 401 | UNAUTHORIZED | access token이 없거나 유효하지 않음 | 로그인 화면으로 보내거나 토큰 재발급을 시도한다. |
| 401 | INVALID_CREDENTIALS | 이메일 또는 비밀번호가 틀림 | 로그인 실패 메시지를 보여준다. |
| 401 | INVALID_REFRESH_TOKEN | refresh token이 없거나 유효하지 않음 | 재로그인을 요구한다. |
| 403 | FORBIDDEN | 인증은 됐지만 권한이 없음 | 접근 불가 메시지를 보여준다. |
| 404 | NOT_FOUND | 존재하지 않는 API 경로 요청 | 프론트 API 경로 설정을 확인한다. |
| 405 | METHOD_NOT_ALLOWED | 지원하지 않는 HTTP method 사용 | 명세에 맞는 method로 재요청한다. |
| 409 | EMAIL_ALREADY_EXISTS | 이미 가입된 이메일 | 로그인으로 유도한다. |
| 409 | NICKNAME_ALREADY_EXISTS | 이미 사용 중인 닉네임 | 다른 닉네임 입력을 안내한다. |
| 409 | DUPLICATED_REQUEST | 같은 기록 저장 요청이 짧은 시간 안에 중복 전송됨 | 저장 버튼을 비활성화하고 이미 저장된 결과를 보여준다. |
| 413 | PAYLOAD_TOO_LARGE | 요청 body 크기가 서버 허용치를 초과함 | 불필요한 필드를 제거하고 다시 요청한다. |
| 415 | UNSUPPORTED_MEDIA_TYPE | `Content-Type`이 `application/json`이 아님 | 요청 헤더를 `application/json`으로 설정한다. |
| 429 | TOO_MANY_REQUESTS | 짧은 시간에 요청을 너무 많이 보냄 | 잠시 후 다시 시도하도록 안내한다. |
| 500 | INTERNAL_SERVER_ERROR | 서버 내부 오류 | 재시도 안내를 보여주고 로그를 확인한다. |
| 503 | SERVICE_UNAVAILABLE | DB 또는 서버가 일시적으로 사용 불가 | 잠시 후 재시도하도록 안내한다. |

## 5. 데이터 모델

### User

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | 유저 ID |
| email | string | 이메일 |
| nickname | string | 닉네임 |
| createdAt | string | 가입 시간 |
| updatedAt | string | 수정 시간 |

### LeaderboardEntry

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | 리더보드 기록 ID |
| rank | number | 현재 순위 |
| userId | string | 유저 ID |
| nickname | string | 리더보드에 표시할 닉네임 |
| accuracy | number | 정확도 |
| judgement | string | 판정 문구 |
| createdAt | string | 기록 생성 시간 |

### Judgement

| 정확도 | judgement |
| --- | --- |
| 100 | PERFECT_CHARGE |
| 90~99 | GREAT |
| 70~89 | GOOD |
| 40~69 | WEAK |
| 1~39 | BAD |
| 0 | MISS |

## 6. API 목록

| Method | Endpoint | 인증 | 설명 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | N | 회원가입 |
| POST | `/api/auth/login` | N | 로그인 |
| POST | `/api/auth/refresh` | Cookie | access token 재발급 |
| POST | `/api/auth/logout` | Cookie | 로그아웃 |
| GET | `/api/auth/me` | Y | 내 정보 조회 |
| POST | `/api/leaderboard` | Y | 플레이 결과 저장 |
| GET | `/api/leaderboard` | N | 리더보드 상위 기록 조회 |

## 7. 회원가입

### POST `/api/auth/register`

이메일, 비밀번호, 닉네임으로 계정을 생성한다.

### Request Body

```json
{
  "email": "player@example.com",
  "password": "Game1234!",
  "nickname": "player1"
}
```

### Success Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_01HXYZ123456789",
      "email": "player@example.com",
      "nickname": "player1",
      "createdAt": "2026-05-11T00:00:00.000Z",
      "updatedAt": "2026-05-11T00:00:00.000Z"
    },
    "accessToken": "jwt.access.token"
  }
}
```

성공 시 refresh token은 HttpOnly cookie로 내려준다.

### Error Responses

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "회원가입 입력값이 올바르지 않습니다.",
    "details": [
      {
        "field": "password",
        "reason": "비밀번호는 8~64자이며 대문자, 소문자, 숫자, 특수문자를 각각 1개 이상 포함해야 합니다."
      }
    ]
  }
}
```

해결 방법:

- 프론트에서 이메일, 비밀번호, 닉네임 조건을 사전 검증한다.
- 비밀번호 조건은 입력 중 실시간으로 표시한다.

#### 409 EMAIL_ALREADY_EXISTS

```json
{
  "success": false,
  "error": {
    "code": "EMAIL_ALREADY_EXISTS",
    "message": "이미 가입된 이메일입니다."
  }
}
```

해결 방법:

- 로그인 화면으로 이동할 수 있는 버튼을 보여준다.

#### 409 NICKNAME_ALREADY_EXISTS

```json
{
  "success": false,
  "error": {
    "code": "NICKNAME_ALREADY_EXISTS",
    "message": "이미 사용 중인 닉네임입니다."
  }
}
```

해결 방법:

- 닉네임 입력창에 포커스하고 다른 닉네임을 입력하도록 안내한다.

## 8. 로그인

### POST `/api/auth/login`

이메일과 비밀번호로 로그인한다.

### Request Body

```json
{
  "email": "player@example.com",
  "password": "Game1234!"
}
```

### Success Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_01HXYZ123456789",
      "email": "player@example.com",
      "nickname": "player1",
      "createdAt": "2026-05-11T00:00:00.000Z",
      "updatedAt": "2026-05-11T00:00:00.000Z"
    },
    "accessToken": "jwt.access.token"
  }
}
```

성공 시 refresh token은 HttpOnly cookie로 내려준다.

### Error Responses

#### 401 INVALID_CREDENTIALS

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "이메일 또는 비밀번호가 올바르지 않습니다."
  }
}
```

해결 방법:

- 보안상 이메일 존재 여부를 따로 알려주지 않는다.
- 프론트는 동일한 로그인 실패 메시지만 보여준다.

#### 429 TOO_MANY_REQUESTS

```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."
  }
}
```

해결 방법:

- 로그인 버튼을 잠시 비활성화한다.
- 서버는 IP 또는 이메일 기준으로 rate limit을 적용한다.

## 9. 토큰 재발급

### POST `/api/auth/refresh`

HttpOnly cookie의 refresh token을 검증하고 새 access token과 새 refresh token을 발급한다.

### 처리 규칙

- refresh token rotation을 적용한다.
- 기존 refresh token은 즉시 폐기한다.
- 새 refresh token은 해시로 저장한다.
- refresh token 재사용이 감지되면 해당 유저의 refresh token을 모두 폐기한다.

### Success Response

```json
{
  "success": true,
  "data": {
    "accessToken": "new.jwt.access.token"
  }
}
```

성공 시 새 refresh token은 HttpOnly cookie로 내려준다.

### Error Responses

#### 401 INVALID_REFRESH_TOKEN

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "로그인이 만료되었습니다. 다시 로그인해주세요."
  }
}
```

해결 방법:

- 저장 중인 access token을 제거한다.
- 로그인 화면으로 이동한다.

## 10. 로그아웃

### POST `/api/auth/logout`

현재 refresh token을 폐기하고 refresh token cookie를 제거한다.

### Success Response

```json
{
  "success": true,
  "data": {
    "message": "로그아웃되었습니다."
  }
}
```

### 처리 규칙

- refresh token cookie가 없어도 성공 응답을 반환한다.
- 서버에 저장된 현재 refresh token hash가 있으면 폐기한다.

## 11. 내 정보 조회

### GET `/api/auth/me`

access token으로 현재 로그인된 유저 정보를 조회한다.

### Success Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_01HXYZ123456789",
      "email": "player@example.com",
      "nickname": "player1",
      "createdAt": "2026-05-11T00:00:00.000Z",
      "updatedAt": "2026-05-11T00:00:00.000Z"
    }
  }
}
```

### Error Responses

#### 401 UNAUTHORIZED

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "인증이 필요합니다."
  }
}
```

## 12. 플레이 결과 저장

### POST `/api/leaderboard`

로그인된 유저의 플레이 결과를 리더보드에 저장한다.

### 인증

```http
Authorization: Bearer <accessToken>
```

### Request Body

```json
{
  "accuracy": 96
}
```

### 처리 규칙

- `userId`와 `nickname`은 access token의 유저 정보와 DB 유저 정보에서 가져온다.
- 클라이언트는 `nickname`, `userId`, `judgement`를 보내지 않는다.
- 서버는 `accuracy` 값을 기준으로 `judgement`를 계산한다.
- 기록 저장 후 해당 기록의 현재 순위를 함께 반환한다.
- 동일 정확도 기록이 있을 경우 먼저 등록된 기록이 더 높은 순위를 가진다.

### Success Response

```json
{
  "success": true,
  "data": {
    "entry": {
      "id": "lb_01HXYZ123456789",
      "rank": 3,
      "userId": "usr_01HXYZ123456789",
      "nickname": "player1",
      "accuracy": 96,
      "judgement": "GREAT",
      "createdAt": "2026-05-11T00:00:00.000Z"
    }
  }
}
```

### Error Responses

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "정확도는 0~100 사이의 정수여야 합니다.",
    "details": [
      {
        "field": "accuracy",
        "reason": "정확도는 0~100 사이의 정수여야 합니다."
      }
    ]
  }
}
```

해결 방법:

- 정확도는 소수점 없는 정수로 전송한다.
- 정확도는 0보다 작거나 100보다 클 수 없다.

#### 401 UNAUTHORIZED

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "기록 저장을 위해 로그인이 필요합니다."
  }
}
```

해결 방법:

- access token이 만료된 경우 `/api/auth/refresh`를 먼저 호출한다.
- refresh token도 만료된 경우 로그인 화면으로 이동한다.

#### 409 DUPLICATED_REQUEST

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATED_REQUEST",
    "message": "이미 저장된 기록입니다."
  }
}
```

해결 방법:

- 기록 등록 버튼을 한 번 누르면 즉시 비활성화한다.
- 이미 저장된 기록이 있으면 추가 요청 없이 결과 화면을 유지한다.

#### 429 TOO_MANY_REQUESTS

```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
  }
}
```

해결 방법:

- 저장 버튼 연타를 막는다.
- 실패 시 즉시 반복 요청하지 않고 1~3초 후 재시도한다.

## 13. 리더보드 조회

### GET `/api/leaderboard`

정확도 기준 상위 리더보드 기록을 조회한다.

로그인하지 않아도 조회할 수 있다.

### Query Parameters

| 필드 | 타입 | 필수 | 기본값 | 검증 규칙 |
| --- | --- | --- | --- | --- |
| limit | number | N | 10 | 1~100 사이의 정수 |

### 정렬 기준

1. `accuracy` 높은 순
2. `createdAt` 빠른 순

### Success Response

```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": "lb_01HXYZ123456789",
        "rank": 1,
        "userId": "usr_01HXYZ123456789",
        "nickname": "perfect",
        "accuracy": 100,
        "judgement": "PERFECT_CHARGE",
        "createdAt": "2026-05-11T00:00:00.000Z"
      }
    ]
  }
}
```

### Error Responses

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "limit은 1~100 사이의 정수여야 합니다.",
    "details": [
      {
        "field": "limit",
        "reason": "limit은 1~100 사이의 정수여야 합니다."
      }
    ]
  }
}
```

## 14. 프론트 인증 처리 기준

| 상황 | 처리 |
| --- | --- |
| 회원가입 성공 | access token을 메모리에 저장하고 게임 화면으로 이동 |
| 로그인 성공 | access token을 메모리에 저장하고 게임 화면으로 이동 |
| access token 만료 | `/api/auth/refresh` 호출 후 기존 요청 재시도 |
| refresh token 만료 | access token 제거 후 로그인 화면으로 이동 |
| 로그아웃 | `/api/auth/logout` 호출 후 access token 제거 |
| 기록 저장 시 401 | refresh 시도 후 실패하면 로그인 화면으로 이동 |

## 15. 프론트 에러 처리 기준

| 상황 | 사용자 메시지 | 화면 처리 |
| --- | --- | --- |
| 이메일 검증 실패 | 올바른 이메일을 입력해주세요. | 이메일 입력창에 포커스 |
| 비밀번호 검증 실패 | 비밀번호 조건을 확인해주세요. | 비밀번호 조건 표시 |
| 닉네임 검증 실패 | 닉네임은 한글, 영문, 숫자 2~12자로 입력해주세요. | 닉네임 입력창에 포커스 |
| 이메일 중복 | 이미 가입된 이메일입니다. | 로그인 버튼 노출 |
| 닉네임 중복 | 이미 사용 중인 닉네임입니다. | 닉네임 입력창에 포커스 |
| 로그인 실패 | 이메일 또는 비밀번호가 올바르지 않습니다. | 로그인 폼 유지 |
| 인증 만료 | 로그인이 만료되었습니다. 다시 로그인해주세요. | 로그인 화면 이동 |
| 정확도 검증 실패 | 점수 계산에 문제가 발생했습니다. 다시 플레이해주세요. | 다시하기 버튼 노출 |
| 중복 저장 | 이미 저장된 기록입니다. | 결과 화면 유지 |
| 리더보드 조회 실패 | 리더보드를 불러오지 못했습니다. | 다시 불러오기 버튼 노출 |
| 요청 과다 | 요청이 많습니다. 잠시 후 다시 시도해주세요. | 버튼 1~3초 비활성화 |
| 서버 오류 | 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요. | 재시도 버튼 노출 |
| 서비스 사용 불가 | 현재 서비스를 사용할 수 없습니다. | 게임 플레이는 계속 허용 |

## 16. MVP 제외 API

MVP에서는 아래 API를 만들지 않는다.

- OAuth 로그인 API
- 비밀번호 찾기 API
- 내 기록 전체 조회 API
- 기록 삭제 API
- 스테이지 API
- 난이도 API
- 상점 API
- 업적 API

## 17. 구현 메모

- 이메일은 소문자로 정규화해서 저장한다.
- 비밀번호는 bcrypt 또는 argon2로 해시한다.
- access token payload에는 `sub`, `email`, `nickname`만 포함한다.
- refresh token은 원문을 DB에 저장하지 않고 해시만 저장한다.
- refresh token rotation을 적용한다.
- 리더보드에는 이메일을 노출하지 않는다.
- 서버는 판정 문구를 직접 계산해 저장한다.

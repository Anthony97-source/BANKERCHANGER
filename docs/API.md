# API Documentation

Human-readable guide to the HTTP API. The machine-readable source of truth is [`openapi.yaml`](../openapi.yaml); this document mirrors it and adds examples, rate-limit notes, and error explanations.

---

## Table of Contents

- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
  - [Bearer JWT](#bearer-jwt)
  - [Oracle Key](#oracle-key)
- [Rate Limits](#rate-limits)
- [Error Codes](#error-codes)
- [Endpoints](#endpoints)
  - [Health](#health)
  - [Auth](#auth)
  - [Users](#users)
  - [Markets](#markets)
  - [Orders](#orders)
  - [Positions](#positions)
  - [Oracle](#oracle)
  - [Admin](#admin)

---

## Overview

The API is organized around REST. It accepts and returns JSON-encoded request and response bodies. All timestamps are ISO 8601 UTC strings. Monetary amounts are returned as decimal strings to preserve precision.

Endpoints are grouped by tag:

| Tag | Description |
| --- | --- |
| `Health` | Liveness and readiness probes. |
| `Auth` | Registration, login, token refresh, and logout. |
| `Users` | User profile and account management. |
| `Markets` | Market listing and detail retrieval. |
| `Orders` | Order creation, listing, and cancellation. |
| `Positions` | Open positions and trade history. |
| `Oracle` | Price feed ingestion (service-to-service). |
| `Admin` | Administrative operations (requires admin role). |

---

## Base URL

```
https://api.example.com/v1
```

All paths below are relative to the base URL.

---

## Authentication

Two authentication schemes are supported. Each endpoint documents which scheme it requires.

### Bearer JWT

Most endpoints require a bearer token obtained from [`POST /auth/login`](#post-authlogin). Send it in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Access tokens expire after **15 minutes**. Use [`POST /auth/refresh`](#post-authrefresh) with a valid refresh token to obtain a new access token. Requests with a missing, malformed, or expired token receive `401 UNAUTHORIZED`.

### Oracle Key

The `Oracle` endpoints are intended for trusted price-feed services and use a static API key instead of a JWT. Send it in the `X-Oracle-Key` header:

```
X-Oracle-Key: <oracle_key>
```

A missing or invalid oracle key receives `401 UNAUTHORIZED`. Oracle keys are provisioned out-of-band and are not issued by the public API.

---

## Rate Limits

Rate limits are applied per client (by authenticated user ID, or by IP address for unauthenticated requests). Limits use a sliding window. When a limit is exceeded the API responds with `429 RATE_LIMITED` and includes the following headers:

| Header | Description |
| --- | --- |
| `X-RateLimit-Limit` | Maximum requests allowed in the window. |
| `X-RateLimit-Remaining` | Requests remaining in the current window. |
| `X-RateLimit-Reset` | Unix epoch seconds when the window resets. |
| `Retry-After` | Seconds to wait before retrying. |

| Route group | Limit |
| --- | --- |
| `Health` | Unlimited |
| `Auth` | 10 requests / minute |
| `Users` | 60 requests / minute |
| `Markets` | 120 requests / minute |
| `Orders` | 60 requests / minute |
| `Positions` | 60 requests / minute |
| `Oracle` | 300 requests / minute |
| `Admin` | 30 requests / minute |

---

## Error Codes

All errors return a JSON body with a stable `code`, a human-readable `message`, and optional `details`:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request body is invalid.",
  "details": { "field": "email", "reason": "must be a valid email" }
}
```

The table below is generated from `errorCodes.ts`.

| Code | HTTP Status | Description |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | The request body or query parameters failed validation. Check `details` for the offending field. |
| `UNAUTHORIZED` | 401 | Missing, malformed, or expired credentials. Re-authenticate and retry. |
| `FORBIDDEN` | 403 | Authenticated but not permitted to perform this action (e.g. non-admin calling an `Admin` route). |
| `NOT_FOUND` | 404 | The requested resource does not exist. |
| `CONFLICT` | 409 | The request conflicts with the current state (e.g. duplicate email, order already filled). |
| `RATE_LIMITED` | 429 | Too many requests. Respect the `Retry-After` header. |
| `INTERNAL_ERROR` | 500 | An unexpected server error occurred. Retry later; contact support if it persists. |
| `SERVICE_UNAVAILABLE` | 503 | A dependency is unavailable. Retry with backoff. |

---

## Endpoints

### Health

#### `GET /health`

Liveness probe. Returns `200` when the process is running. No authentication required.

**Example**

```bash
curl https://api.example.com/v1/health
```

```json
{ "status": "ok" }
```

#### `GET /health/ready`

Readiness probe. Returns `200` when dependencies (database, cache) are reachable, otherwise `503 SERVICE_UNAVAILABLE`. No authentication required.

**Example**

```bash
curl https://api.example.com/v1/health/ready
```

```json
{ "status": "ready", "checks": { "database": "ok", "cache": "ok" } }
```

---

### Auth

#### `POST /auth/register`

Create a new user account. No authentication required.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | yes | Valid email address. Must be unique. |
| `password` | string | yes | Minimum 8 characters. |
| `displayName` | string | no | Display name shown in the UI. |

**Example**

```bash
curl -X POST https://api.example.com/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"s3cret-pass","displayName":"Alice"}'
```

```json
{
  "id": "usr_01HXYZ",
  "email": "alice@example.com",
  "displayName": "Alice",
  "createdAt": "2024-05-01T12:00:00Z"
}
```

Errors: `VALIDATION_ERROR`, `CONFLICT` (email already registered).

#### `POST /auth/login`

Exchange credentials for an access token and refresh token. No authentication required.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | yes | Registered email address. |
| `password` | string | yes | Account password. |

**Example**

```bash
curl -X POST https://api.example.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"s3cret-pass"}'
```

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "rt_01HXYZ...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED` (invalid credentials).

#### `POST /auth/refresh`

Exchange a refresh token for a new access token. No bearer authentication required; the refresh token is supplied in the body.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `refreshToken` | string | yes | A valid, unexpired refresh token. |

**Example**

```bash
curl -X POST https://api.example.com/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"rt_01HXYZ..."}'
```

```json
{
  "accessToken": "eyJhbGciOi...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED` (invalid or expired refresh token).

#### `POST /auth/logout`

Revoke the current refresh token. Requires bearer authentication.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `refreshToken` | string | yes | The refresh token to revoke. |

**Example**

```bash
curl -X POST https://api.example.com/v1/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"rt_01HXYZ..."}'
```

```json
{ "revoked": true }
```

Errors: `UNAUTHORIZED`.

---

### Users

#### `GET /users/me`

Return the authenticated user's profile. Requires bearer authentication.

**Example**

```bash
curl https://api.example.com/v1/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "id": "usr_01HXYZ",
  "email": "alice@example.com",
  "displayName": "Alice",
  "role": "user",
  "createdAt": "2024-05-01T12:00:00Z"
}
```

Errors: `UNAUTHORIZED`.

#### `PATCH /users/me`

Update the authenticated user's profile. Requires bearer authentication.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `displayName` | string | no | New display name. |

**Example**

```bash
curl -X PATCH https://api.example.com/v1/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Alice B."}'
```

```json
{
  "id": "usr_01HXYZ",
  "email": "alice@example.com",
  "displayName": "Alice B.",
  "role": "user",
  "createdAt": "2024-05-01T12:00:00Z"
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED`.

---

### Markets

#### `GET /markets`

List markets. Requires bearer authentication.

**Query parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | no | Filter by status: `open`, `closed`, `settled`. |
| `limit` | integer | no | Page size, 1–100. Default `20`. |
| `cursor` | string | no | Opaque pagination cursor from a previous response. |

**Example**

```bash
curl "https://api.example.com/v1/markets?status=open&limit=2" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "data": [
    {
      "id": "mkt_01HABC",
      "question": "Will it rain in NYC on 2024-06-01?",
      "status": "open",
      "yesPrice": "0.62",
      "noPrice": "0.38",
      "closesAt": "2024-06-01T00:00:00Z"
    }
  ],
  "nextCursor": null
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED`.

#### `GET /markets/{marketId}`

Retrieve a single market. Requires bearer authentication.

**Path parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| `marketId` | string | Market identifier. |

**Example**

```bash
curl https://api.example.com/v1/markets/mkt_01HABC \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "id": "mkt_01HABC",
  "question": "Will it rain in NYC on 2024-06-01?",
  "status": "open",
  "yesPrice": "0.62",
  "noPrice": "0.38",
  "closesAt": "2024-06-01T00:00:00Z",
  "createdAt": "2024-05-01T12:00:00Z"
}
```

Errors: `UNAUTHORIZED`, `NOT_FOUND`.

---

### Orders

#### `POST /orders`

Place a new order. Requires bearer authentication.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `marketId` | string | yes | Market to trade. |
| `side` | string | yes | `buy` or `sell`. |
| `outcome` | string | yes | `yes` or `no`. |
| `price` | string | yes | Limit price as a decimal string between `0` and `1`. |
| `quantity` | string | yes | Positive decimal string. |

**Example**

```bash
curl -X POST https://api.example.com/v1/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"mkt_01HABC","side":"buy","outcome":"yes","price":"0.60","quantity":"10"}'
```

```json
{
  "id": "ord_01HDEF",
  "marketId": "mkt_01HABC",
  "side": "buy",
  "outcome": "yes",
  "price": "0.60",
  "quantity": "10",
  "filledQuantity": "0",
  "status": "open",
  "createdAt": "2024-05-01T12:05:00Z"
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND` (market), `CONFLICT` (market closed).

#### `GET /orders`

List the authenticated user's orders. Requires bearer authentication.

**Query parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | no | Filter by status: `open`, `filled`, `cancelled`. |
| `limit` | integer | no | Page size, 1–100. Default `20`. |
| `cursor` | string | no | Opaque pagination cursor. |

**Example**

```bash
curl "https://api.example.com/v1/orders?status=open" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "data": [
    {
      "id": "ord_01HDEF",
      "marketId": "mkt_01HABC",
      "side": "buy",
      "outcome": "yes",
      "price": "0.60",
      "quantity": "10",
      "filledQuantity": "0",
      "status": "open",
      "createdAt": "2024-05-01T12:05:00Z"
    }
  ],
  "nextCursor": null
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED`.

#### `DELETE /orders/{orderId}`

Cancel an open order. Requires bearer authentication.

**Path parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| `orderId` | string | Order identifier. |

**Example**

```bash
curl -X DELETE https://api.example.com/v1/orders/ord_01HDEF \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "id": "ord_01HDEF",
  "status": "cancelled",
  "cancelledAt": "2024-05-01T12:10:00Z"
}
```

Errors: `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT` (order already filled or cancelled).

---

### Positions

#### `GET /positions`

List the authenticated user's open positions. Requires bearer authentication.

**Example**

```bash
curl https://api.example.com/v1/positions \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "data": [
    {
      "marketId": "mkt_01HABC",
      "outcome": "yes",
      "quantity": "10",
      "averagePrice": "0.60",
      "unrealizedPnl": "0.20"
    }
  ]
}
```

Errors: `UNAUTHORIZED`.

#### `GET /positions/history`

List the authenticated user's trade history. Requires bearer authentication.

**Query parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | integer | no | Page size, 1–100. Default `20`. |
| `cursor` | string | no | Opaque pagination cursor. |

**Example**

```bash
curl "https://api.example.com/v1/positions/history?limit=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "data": [
    {
      "tradeId": "trd_01HGHI",
      "marketId": "mkt_01HABC",
      "outcome": "yes",
      "side": "buy",
      "price": "0.60",
      "quantity": "10",
      "executedAt": "2024-05-01T12:06:00Z"
    }
  ],
  "nextCursor": null
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED`.

---

### Oracle

Oracle endpoints use the [oracle key](#oracle-key) scheme, not bearer JWTs.

#### `POST /oracle/prices`

Submit a price update for a market. Requires the `X-Oracle-Key` header.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `marketId` | string | yes | Market the price applies to. |
| `yesPrice` | string | yes | Decimal string between `0` and `1`. |
| `observedAt` | string | yes | ISO 8601 timestamp of the observation. |

**Example**

```bash
curl -X POST https://api.example.com/v1/oracle/prices \
  -H "X-Oracle-Key: $ORACLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"marketId":"mkt_01HABC","yesPrice":"0.63","observedAt":"2024-05-01T12:15:00Z"}'
```

```json
{
  "marketId": "mkt_01HABC",
  "yesPrice": "0.63",
  "noPrice": "0.37",
  "observedAt": "2024-05-01T12:15:00Z",
  "accepted": true
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`.

---

### Admin

Admin endpoints require bearer authentication **and** the `admin` role. Non-admin callers receive `403 FORBIDDEN`.

#### `POST /admin/markets`

Create a new market. Requires bearer authentication with the `admin` role.

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `question` | string | yes | The market question. |
| `closesAt` | string | yes | ISO 8601 close time. |

**Example**

```bash
curl -X POST https://api.example.com/v1/admin/markets \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"Will it rain in NYC on 2024-06-01?","closesAt":"2024-06-01T00:00:00Z"}'
```

```json
{
  "id": "mkt_01HABC",
  "question": "Will it rain in NYC on 2024-06-01?",
  "status": "open",
  "closesAt": "2024-06-01T00:00:00Z",
  "createdAt": "2024-05-01T12:00:00Z"
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`.

#### `POST /admin/markets/{marketId}/settle`

Settle a market with the winning outcome. Requires bearer authentication with the `admin` role.

**Path parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| `marketId` | string | Market identifier. |

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `outcome` | string | yes | Winning outcome: `yes` or `no`. |

**Example**

```bash
curl -X POST https://api.example.com/v1/admin/markets/mkt_01HABC/settle \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"outcome":"yes"}'
```

```json
{
  "id": "mkt_01HABC",
  "status": "settled",
  "outcome": "yes",
  "settledAt": "2024-06-01T00:05:00Z"
}
```

Errors: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` (market already settled).
# Mini SMS Gateway

A production-grade backend API for a bulk SMS platform. It handles user wallets, atomic credit deductions, SMS segmentation, provider failover, refunds, and telemetry (logs and route health).

Built for the **Nest Nepal Backend Developer Intern** assignment.

---

## Table of Contents

- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Setup (Fresh Machine)](#-setup-fresh-machine)
- [Environment Variables](#-environment-variables)
- [Design Decisions](#-design-decisions)
- [Route Health Formula](#-route-health-formula)
- [Future Improvements](#-future-improvements)
- [Demo Video](#-demo-video)

---

## 🛠 Tech Stack

| Layer     | Technology                         |
| --------- | ---------------------------------- |
| Runtime   | Node.js (ESM)                      |
| Framework | Express.js                         |
| Database  | PostgreSQL (hosted on Supabase)    |
| Auth      | JWT (JSON Web Tokens) and bcryptjs |
| Testing   | Vitest and Supertest               |

---

## ✨ Features

- **User wallets** with atomic credit deduction
- **SMS segmentation** (GSM-7 and Unicode/UCS-2) with accurate part counting
- **Strict phone number validation** (E.164 normalization for Nepali numbers)
- **Per-recipient provider failover** by priority
- **Idempotent automatic refunds** when all providers fail
- **Telemetry:** message logs, route attempt history, and route health scoring

---

## 🚀 Setup (Fresh Machine)

### 1. Clone the repository

```bash
git clone <your-github-repo-url>
cd nest-sms-gateway
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env` (see [Environment Variables](#-environment-variables)).

### 4. Run database migrations and seed

This creates all tables and seeds the mock providers (`ROUTE_A`, `ROUTE_B`, `ROUTE_C`).

```bash
npm run migrate
```

### 5. Start the server

```bash
npm run dev
```

The API will be available at **http://localhost:3000**.

### 6. Run tests (optional)

```bash
npm test
```

---

## 🔐 Environment Variables

| Variable       | Description                                                                   |
| -------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL` | Supabase PostgreSQL connection string (use port `5432` or the Session Pooler) |
| `JWT_SECRET`   | A long, random, secure string used to sign JWTs                               |
| `PORT`         | Port the server listens on (default: `3000`)                                  |

---

## Design Decisions

### 1. Pricing and SMS Segmentation

- **Credit rate:** 1 credit per SMS part, per recipient.
- **GSM-7 vs Unicode:** The entire message is classified as GSM-7 only if it contains standard GSM characters (160 chars for a single part, 153 per part when concatenated). If any character is non-standard (Nepali, emoji, etc.), the whole message switches to UCS-2 (70 chars for a single part, 67 per part when concatenated).
- **Extension characters:** GSM-7 extension characters (`^ { } \ [ ~ ] | €`) count as 2 septets, which can trigger a new part sooner.
- **Phone numbers:** Strict E.164 normalization. `+977`, `977`, and whitespace are stripped. The remaining number must be exactly 10 digits and start with `97` or `98`.

### 2. Concurrency and Transactions

- **Atomic deductions:** Instead of a naive `SELECT` followed by `UPDATE`, the system uses a single conditional update:

  ```sql
  UPDATE wallets
  SET balance = balance - $1
  WHERE user_id = $2 AND balance >= $1;
  ```

  This relies on PostgreSQL row-level locking, so parallel requests can never overspend or drive a wallet negative.

- **Rollback safety:** The entire `POST /sms/send` flow runs inside a single database transaction. If a crash occurs or an error is thrown at any point, all changes are rolled back, leaving no orphan messages and no phantom deductions.

### 3. Failover Granularity

Failover is handled **per recipient**.

- Providers are queried by priority (`ORDER BY priority ASC`).
- Providers with insufficient balance are skipped.
- On success, the provider's balance is deducted atomically.
- Every attempt, successful or failed, is logged in the `route_attempts` table.

### 4. Refunds

If a message fails on every available provider, the user's credits are refunded automatically.

Refunds are **idempotent**. A `WHERE refunded = false` guard ensures a user can never be refunded twice for the same message.

---

## 📊 Route Health Formula

The `GET /routes/health` endpoint scores each provider with the following formula:

```
Health Score = (Success Rate × 0.7) + (Balance Headroom × 0.3)
```

| Component        | Weight | Calculation                                                                                                                      |
| ---------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Success Rate     | 70%    | `(Successful Attempts / Total Attempts) × 100` over the last 24 hours. Providers with zero attempts default to a neutral `100%`. |
| Balance Headroom | 30%    | `min((Current Balance / 500) × 100, 100)`. `500` is the benchmark for a "full" provider.                                         |

**Rationale:** Reliability is weighted highest because a provider that constantly fails is useless regardless of how much balance it holds. Balance headroom accounts for providers that are running low and may soon be skipped.

---

## 🛡️ Future Improvements

Given more time, I would add:

- **Idempotency keys:** Currently, a double-click on "Send" caused by network lag is treated as two requests and charged twice. An `Idempotency-Key` header would deduplicate identical requests.
- **Queue-based architecture (Bonus B1):** The synchronous transaction currently holds a database connection while simulating the provider call. In production, I would use BullMQ and Redis to queue delivery and return `202 Accepted` immediately.
- **Delivery reports (Bonus B3):** A webhook endpoint so telecom providers can asynchronously update message status from `pending` to `delivered` or `failed`.
- **Rate limiting (Bonus B2):** Per-user limits (e.g. 60 requests/minute) to prevent abuse.
- **Provider capacity modeling:** Store each provider's initial balance in the database so Balance Headroom normalizes against real capacity instead of a hardcoded `500`.

---

## 🎥 Demo Video

A 3–5 minute walkthrough demonstrating **Send**, **Failover**, **Refund**, and **Logs** functionality:

👉 [Watch the demo](https://www.loom.com/share/00257df8c42b44b2b1d96efaaf99e078)

---

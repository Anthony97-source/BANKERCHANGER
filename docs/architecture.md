# BANKERCHANGER — Architecture Documentation

This document describes the high-level system architecture, data flows, and key interaction patterns of the BANKERCHANGER decentralized boxing prediction market.

## Table of Contents

- [System Overview](#system-overview)
- [System Diagram](#system-diagram)
- [Component Breakdown](#component-breakdown)
- [Contract Interactions](#contract-interactions)
- [Data Flow: Bet Placement to Resolution](#data-flow-bet-placement-to-resolution)
- [Data Flow: Contract Event to Frontend](#data-flow-contract-event-to-frontend)
- [Indexer Flow](#indexer-flow)
- [API Layers](#api-layers)
- [Caching Strategy](#caching-strategy)
- [Database Schema](#database-schema)
- [Oracle Resolution Flow](#oracle-resolution-flow)
- [Bet Placement Flow](#bet-placement-flow)
- [Claim Payout Flow](#claim-payout-flow)
- [External Dependencies](#external-dependencies)

## System Overview

BANKERCHANGER is a full-stack decentralized application consisting of four main layers:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Smart Contracts** | Rust / Soroban SDK | On-chain market logic, treasury, factory |
| **Indexer** | TypeScript | Polls Soroban events, persists to database |
| **Backend API** | Express / TypeScript | REST API, auth, caching, WebSocket feed |
| **Frontend** | Next.js 14 / React | User interface, wallet integration |

Supporting services include PostgreSQL (primary data store), Redis (caching and rate limiting), and Prometheus (metrics).

## System Diagram

```mermaid
graph TB
    subgraph Stellar["Stellar / Soroban Network"]
        MC["market contract<br/>contracts/market/src/lib.rs"]
        MF["market_factory contract<br/>contracts/market_factory/src/lib.rs"]
        TR["treasury contract<br/>contracts/treasury/src/lib.rs"]
        SH["shared events & types<br/>contracts/shared/src/events.rs"]
        MC -.->|uses| SH
        MF -.->|uses| SH
        TR -.->|uses| SH
        MF -->|creates / resolves| MC
        MC -->|payout transfer| TR
    end

    subgraph Backend["Backend (Express / TypeScript)"]
        RT["Routes<br/>market · bet · oracle"]
        CT["Controllers"]
        SV["Services"]
        IX["Indexer<br/>StellarIndexer · EventProcessor · ledgerTracker"]
        CS["Cache Service<br/>cache.service.ts"]
        RD["Redis Client<br/>redis.ts"]
        WS["WebSocket Server"]
        CR["Cron Jobs"]
        MT["Metrics /metrics"]
        RT --> CT --> SV
        SV --> CS --> RD
        SV --> WS
        CR --> SV
        MT --> SV
    end

    subgraph Data["Data Stores"]
        PG[("PostgreSQL")]
        RDS[("Redis")]
    end

    subgraph Frontend["Frontend (Next.js 14)"]
        UI["Next.js App<br/>Zustand · React Query"]
    end

    subgraph External["External"]
        OR["Oracle Nodes"]
        PR["Prometheus"]
    end

    MC -->|events| IX
    MF -->|events| IX
    TR -->|events| IX
    IX -->|write| PG
    SV -->|read/write| PG
    RD --- RDS
    WS -->|push| UI
    UI -->|HTTP| RT
    UI -->|WS| WS
    UI -->|sign tx| MC
    OR -->|submit report| RT
    SV -->|resolve| MC
    MT -->|scrape| PR
```

## Component Breakdown

### Smart Contracts (Soroban)

| Contract | Source | Responsibility |
|----------|--------|---------------|
| **shared** | `contracts/shared/src/events.rs` | Common types, error codes, AMM math, event helpers |
| **market_factory** | `contracts/market_factory/src/lib.rs` | Creates markets, manages oracle whitelist, emergency pause |
| **market** | `contracts/market/src/lib.rs` | Individual market logic — bet placement, claims, refunds |
| **treasury** | `contracts/treasury/src/lib.rs` | Fund custody, withdrawal limits, payout distribution |

**Security features:** Reentrancy guards (CLAIMING flag), emergency pause, oracle whitelist enforcement, 2-of-3 oracle consensus.

### Indexer

The indexer runs as a standalone TypeScript process that:

1. Polls the Soroban RPC endpoint every 5 seconds via `getEvents()`.
2. Filters events by contract ID and topic.
3. Parses `scVal` event payloads.
4. Upserts event data into PostgreSQL.
5. Maintains a cursor (`indexer_checkpoints` table) for crash recovery.

### Backend API

Express.js application providing:

- **REST API** — Markets, bets, claims, admin, auth, oracle endpoints.
- **Authentication** — JWT with session version tracking, 2FA/TOTP support.
- **Rate Limiting** — Redis-backed, per-route IP and user-based limits.
- **Caching** — Redis with 30-second TTLs and pattern-based invalidation.
- **WebSocket** — Real-time activity feed for live market updates.
- **Cron Jobs** — Auto-resolution, auto-lock, session/token cleanup.
- **Metrics** — Prometheus counters and histograms on `/metrics`.

### Frontend

Next.js 14 App Router application with:

- **State management** — Zustand stores.
- **Data fetching** — TanStack React Query.
- **Wallet integration** — Stellar SDK for transaction signing.
- **Styling** — Tailwind CSS.

## Contract Interactions

The Soroban contracts are the source of truth for market state and funds. The backend and indexer only observe and relay on-chain state; they never mutate balances directly.

### `contracts/market/src/lib.rs`

- `place_bet(market_id, side, amount)` — validates the market is open, transfers XLM into the pool, and emits a `bet_placed` event via the shared event helpers.
- `claim(market_id, bet_id)` — verifies the bet is on the winning side, sets the `CLAIMING` reentrancy flag, requests a payout from the treasury, clears the flag, and emits `payout_claimed`.
- `resolve(market_id, outcome)` — callable only by the factory; stores the consensus outcome, enters `ResolutionPending`, and emits `market_resolution_pending`.
- `finalize_resolution(market_id)` — callable by anyone after the dispute cooldown (ledgers **and** seconds) elapses; transitions the market to `Resolved` and emits `market_resolved`.

### `contracts/market_factory/src/lib.rs`

- `create_market(config)` — deploys a new market contract and registers it.
- `resolve(market_id, outcome)` — the authorized caller the market contract trusts for resolution.
- Oracle whitelist management and emergency pause controls.

### `contracts/treasury/src/lib.rs`

- Custodies pooled funds and enforces withdrawal limits.
- Distributes payouts when the market contract requests a transfer during `claim`.

### `contracts/shared/src/events.rs`

- Defines the canonical event topics and payload structures (`bet_placed`, `market_resolved`, `payout_claimed`, etc.) emitted by all contracts.
- The indexer decodes events using these shared definitions, keeping on-chain and off-chain representations in sync.

## Data Flow: Bet Placement to Resolution

End-to-end flow from a user placing a bet through oracle resolution and payout claim.

```mermaid
sequenceDiagram
    participant U as User (Frontend)
    participant W as Wallet
    participant MC as Market Contract
    participant IX as Indexer
    participant DB as PostgreSQL
    participant API as Backend API
    participant OR as Oracles

    U->>API: GET /api/markets/:id
    API-->>U: Market details + odds
    U->>W: Sign place_bet tx
    W-->>U: Signed tx
    U->>MC: place_bet(market_id, side, amount)
    MC->>MC: Validate open, move XLM to pool
    MC-->>IX: Emit bet_placed event

    IX->>IX: StellarIndexer polls getEvents()
    IX->>IX: EventProcessor decodes scVal
    IX->>DB: Upsert bet + update pool totals
    IX->>DB: ledgerTracker updates checkpoint

    API->>DB: Read updated market
    API-->>U: Updated odds (HTTP + WebSocket)

    Note over OR: Match concludes
    OR->>API: POST /api/oracle/report (2-of-3 consensus)
    API->>MC: resolve(market_id, outcome)
    MC-->>IX: Emit market_resolution_pending
    Note over MC: Dispute cooldown elapses
    MC->>MC: finalize_resolution(market_id)
    MC-->>IX: Emit market_resolved
    IX->>DB: Update market status = resolved
    API-->>U: Resolution pushed via WebSocket

    U->>MC: claim(market_id, bet_id)
    MC->>MC: Verify winning side, CLAIMING guard
    MC-->>IX: Emit payout_claimed
    IX->>DB: Update bet status = claimed
    API-->>U: Confirmation via WebSocket
```

## Data Flow: Contract Event to Frontend

This diagram shows how an on-chain event propagates through the system to the end user.

```mermaid
sequenceDiagram
    participant SC as Soroban Contract
    participant IX as Indexer (Poller)
    participant DB as PostgreSQL
    participant API as REST API
    participant WS as WebSocket Server
    participant UI as Frontend

    SC->>IX: Emit contract event
    IX->>IX: Parse scVal payload
    IX->>DB: Upsert event record
    IX->>DB: Update indexer checkpoint

    Note over API: Cron or request triggers read

    UI->>API: GET /api/markets
    API->>DB: Query markets + events
    DB-->>API: Market data
    API-->>UI: JSON response

    API->>WS: Broadcast update
    WS->>UI: Push via WebSocket
    UI->>UI: Update UI state
```

## Indexer Flow

The standalone `indexer/` microservice is the single authoritative service responsible for polling Stellar blockchain events. It is composed of three cooperating components:

1. **`StellarIndexer`** — The polling loop. Calls the Soroban RPC `getEvents()` endpoint every 5 seconds, filters by contract ID and topic, and hands raw events to the processor. It owns the run loop and retry/backoff behavior.
2. **`EventProcessor`** — Decodes `scVal` payloads using the shared event definitions, maps each event to its domain record (bet, market resolution, payout, etc.), and upserts the results into PostgreSQL inside a transaction.
3. **`ledgerTracker`** — Persists the last processed ledger cursor in the `indexer_checkpoints` table so the indexer can resume from the correct position after a crash or restart, avoiding gaps or duplicate processing.

- **Service Boundary**: The standalone `indexer/` service polls Soroban RPC and Horizon, writes canonical events into the shared PostgreSQL `blockchain_events` table, and updates `indexer_checkpoints`.
- **Backend Role**: The `backend/` service does not run active polling loops; it reads event records from the shared PostgreSQL database and serves queries/WebSockets to clients.
- **Port Assignment**: Indexer runs on port 3002 (REST & WebSocket streams) while Backend runs on port 3001.

## API Layers

The backend is organized into routes → controllers → services. Each route group maps to a controller that validates input and delegates business logic to a service.

| Layer | Route Group | Responsibility |
|-------|-------------|---------------|
| **Market routes** | `/api/markets` | List markets, fetch market detail, odds, and event history |
| **Bet routes** | `/api/bets` | Place-bet metadata, list user bets, claim status |
| **Oracle routes** | `/api/oracle` | Submit oracle reports, query consensus status |

- **Routes** — Express routers that define endpoints and attach middleware (auth, rate limiting, validation).
- **Controllers** — Parse/validate requests, call services, and shape HTTP responses.
- **Services** — Contain business logic (consensus checks, market queries, resolution orchestration) and are the only layer that touches the database and cache.

## Caching Strategy

Caching is implemented in `backend/src/services/cache.service.ts` on top of the Redis client in `backend/src/lib/redis.ts`.

- **`redis.ts`** — Creates and exports the shared Redis connection used for caching and rate limiting.
- **`cache.service.ts`** — Provides `get`/`set`/`invalidate` helpers with a default **30-second TTL** for market and odds reads, plus pattern-based invalidation (e.g. `markets:*`) triggered when the indexer or a resolution changes underlying data.
- **Rate limiting** — Redis-backed per-route IP and user-based limits share the same Redis instance.
- **Invalidation** — Writes that affect a market invalidate the related cache keys so the next read repopulates fresh data.

## Database Schema

The schema is defined in `backend/db/schema.sql` and mirrored in TypeScript types in `backend/src/db/schema.ts`.

```mermaid
erDiagram
    MARKETS ||--o{ BETS : has
    MARKETS ||--o{ ORACLE_REPORTS : receives
    MARKETS ||--o{ BLOCKCHAIN_EVENTS : emits
    USERS ||--o{ BETS : places
    USERS ||--o{ SESSIONS : owns

    MARKETS {
        uuid id PK
        string market_id
        string fighter_a
        string fighter_b
        string status
        string outcome
        numeric pool_a
        numeric pool_b
        numeric pool_draw
        timestamp created_at
    }

    BETS {
        uuid id PK
        uuid market_id FK
        uuid user_id FK
        string side
        numeric amount
        string status
        timestamp created_at
    }

    ORACLE_REPORTS {
        uuid id PK
        uuid market_id FK
        string oracle_key
        string outcome
        string signature
        timestamp created_at
    }

    BLOCKCHAIN_EVENTS {
        uuid id PK
        string contract_id
        string topic
        jsonb payload
        bigint ledger
        timestamp created_at
    }

    INDEXER_CHECKPOINTS {
        string id PK
        bigint last_ledger
        timestamp updated_at
    }

    USERS {
        uuid id PK
        string public_key
        timestamp created_at
    }

    SESSIONS {
        uuid id PK
        uuid user_id FK
        string token
        int session_version
        timestamp expires_at
    }
```

## Oracle Resolution Flow

### Oracle Consensus Mechanism

Oracles are whitelisted Stellar accounts that submit match outcome reports to the backend. The system uses a **2-of-3 consensus model** to prevent any single oracle from unilaterally resolving a market.

#### How Consensus Works

1. **Report Submission**: After a boxing match concludes, each whitelisted oracle independently fetches the official result and submits a signed report via `POST /api/oracle/report`. The report includes the market ID, declared outcome (`fighter_a`, `fighter_b`, or `draw`), and a cryptographic signature.

2. **Report Storage**: Each report is stored in the `oracle_reports` table with the oracle's public key, reported outcome, signature, and timestamp. Reports are immutable once stored.

3. **Consensus Check**: After storing each new report, the backend queries all reports for that market. If **2 out of 3** whitelisted oracles have submitted reports with the **same outcome**, consensus is reached.

4. **On-Chain Resolution**: Once consensus is achieved, the backend invokes the `resolve()` method on the market's Soroban contract. The contract:
   - Validates the resolver is the factory contract (authorized caller)
    - Stores the consensus outcome and enters `ResolutionPending`
    - Keeps claims locked while the dispute cooldown is active
    - Emits a `market_resolution_pending` event

5. **Cooldown Finalization**: Anyone may call `finalize_resolution` after both the configured ledger count and seconds have elapsed. The market becomes `Resolved` and claims unlock only after both thresholds pass. This dual check accounts for variable ledger close times.

6. **Late Reports**: If a third oracle submits a report after resolution, the report is still stored for audit purposes but does not trigger any further action.

7. **No Consensus**: If oracles submit conflicting reports (e.g., 1 for `fighter_a`, 1 for `fighter_b`, 1 for `draw`), the market remains in `locked` status. An automated retry mechanism (`autoResolution.cron.ts`) will re-attempt resolution periodically, giving oracles time to converge.

`MarketConfig.dispute_cooldown_ledgers` and `MarketConfig.dispute_cooldown_secs` are independent minimums. Finalization requires the ledger sequence and timestamp to reach their respective deadlines. Zero values use defaults of 720 ledgers and 3,600 seconds.

#### Consensus Flow Diagram

```mermaid
sequenceDiagram
    participant O1 as Oracle 1
    participant O2 as Oracle 2
    participant O3 as Oracle 3
    participant API as Backend API
    participant DB as PostgreSQL
    participant MC as Market Contract

    Note over O1,O3: Boxing match concludes

    O1->>API: POST /api/oracle/report (outcome: fighter_a, sig: σ₁)
    API->>API: Verify oracle is whitelisted
    API->>API: Verify signature against oracle's public key
    API->>DB: INSERT oracle_report (oracle=O1, outcome=fighter_a)
    API->>DB: SELECT reports WHERE market_id = M
    DB-->>API: [{O1: fighter_a}]
    Note over API: 1/3 reports — no consensus yet
    API-->>O1: 200 OK { consensusReached: false }

    O2->>API: POST /api/oracle/report (outcome: fighter_a, sig: σ₂)
    API->>API: Verify oracle is whitelisted
    API->>API: Verify signature
    API->>DB: INSERT oracle_report (oracle=O2, outcome=fighter_a)
    API->>DB: SELECT reports WHERE market_id = M
    DB-->>API: [{O1: fighter_a}, {O2: fighter_a}]
    Note over API: 2/3 agree on fighter_a — CONSENSUS REACHED

    API->>MC: invoke resolve(market_id, fighter_a)
    MC->>MC: Validate authorized caller
    MC->>MC: Set market.outcome = fighter_a
    MC->>MC: Unlock claims for winning side
    MC->>MC: Emit MarketResolved event
    MC-->>API: Transaction confirmed

    API->>DB: UPDATE market SET status='resolved', outcome='fighter_a'
    API->>API: Broadcast via WebSocket
    API-->>O2: 200 OK { consensusReached: true, txHash: "..." }

    opt Late report (after resolution)
        O3->>API: POST /api/oracle/report (outcome: fighter_a, sig: σ₃)
        API->>DB: INSERT oracle_report (already resolved)
        API-->>O3: 200 OK { alreadyResolved: true }
    end
```

#### Oracle Security Model

| Property | Implementation |
|----------|---------------|
| **Identity** | Each oracle is identified by a whitelisted Stellar public key |
| **Authentication** | Reports must carry a valid Ed25519 signature verifiable against the oracle's key |
| **Authorization** | Only the oracle's registered public key can submit reports on its behalf |
| **Sybil resistance** | Oracles must be whitelisted by the market factory admin |
| **Collusion resistance** | 2-of-3 threshold means no single oracle can unilaterally resolve a market |
| **Non-repudiation** | Signed reports are stored immutably for audit |
| **Liveness** | Auto-resolution cron re-attempts resolution if oracles fail to converge initially |

### Original Oracle Resolution Sequence

Oracles are whitelisted accounts that submit match outcome reports. Resolution requires 2-of-3 consensus.

```mermaid
sequenceDiagram
    participant O1 as Oracle 1
    participant O2 as Oracle 2
    participant O3 as Oracle 3
    participant API as Backend API
    participant DB as PostgreSQL
    participant MC as Market Contract

    Note over O1,O3: Boxing match concludes

    O1->>API: POST /api/oracle/report (outcome: fighter_a)
    API->>DB: Store oracle_report
    API-->>O1: 200 OK

    O2->>API: POST /api/oracle/report (outcome: fighter_a)
    API->>DB: Store oracle_report
    API->>DB: Check consensus (2 of 3 agree)

    Note over API: Consensus reached (2/3)

    API->>MC: invoke resolve(market_id, outcome)
    MC->>MC: Set market outcome, unlock claims
    MC-->>API: Resolution tx confirmed

    API->>DB: Update market status = resolved
    API->>API: Broadcast via WebSocket

    Note over O3: Oracle 3 report is accepted but not required
    O3->>API: POST /api/oracle/report (outcome: fighter_a)
    API->>DB: Store oracle_report (already resolved)
```

## Bet Placement Flow

```mermaid
sequenceDiagram
    participant U as User (Frontend)
    participant W as Wallet (Freighter)
    participant MC as Market Contract
    participant API as Backend API
    participant DB as PostgreSQL
    participant IX as Indexer

    U->>API: GET /api/markets/:id (check market open)
    API->>DB: Query market details
    DB-->>API: Market data (status: open)
    API-->>U: Market details + odds

    U->>U: Select side (fighter_a / fighter_b / draw)
    U->>U: Enter bet amount

    U->>W: Request transaction signature
    W-->>U: Signed transaction

    U->>MC: Submit place_bet(market_id, side, amount)
    MC->>MC: Validate market open, transfer XLM to pool
    MC->>MC: Emit BetPlaced event

    IX->>MC: Poll events
    IX->>DB: Upsert bet record
    IX->>DB: Update market pool totals

    API->>DB: Read updated market
    API-->>U: Updated odds via WebSocket
```

## Claim Payout Flow

```mermaid
sequenceDiagram
    participant U as User (Frontend)
    participant W as Wallet (Freighter)
    participant MC as Market Contract
    participant TR as Treasury Contract
    participant API as Backend API
    participant DB as PostgreSQL

    Note over MC: Market resolved, outcome set

    U->>API: GET /api/markets/:id (check resolved)
    API->>DB: Query market + user bets
    DB-->>API: Market resolved, user has winning bet
    API-->>U: Claimable payout amount

    U->>W: Request claim transaction signature
    W-->>U: Signed transaction

    U->>MC: Submit claim(market_id, bet_id)
    MC->>MC: Verify bet on winning side
    MC->>MC: Set CLAIMING flag (reentrancy guard)
    MC->>TR: Request payout transfer
    TR->>U: Transfer XLM payout
    MC->>MC: Clear CLAIMING flag
    MC->>MC: Emit PayoutClaimed event

    API->>DB: Update bet status = claimed
    API-->>U: Confirmation via WebSocket
```

## External Dependencies

| Dependency | Role |
|------------|------|
| **Stellar / Soroban** | Blockchain network, Soroban RPC, and smart contract runtime |
| **PostgreSQL** | Primary data store (markets, bets, oracle reports, events, checkpoints) |
| **Redis** | Caching and rate limiting |
| **Docker** | Containerized local development and deployment of services |
| **CI** | Automated build, test, and contract verification pipeline |
| **Prometheus** | Metrics scraping and monitoring |


# Dual-Mode Authentication & Sandbox Isolation Plan

Architectural strategy to decouple the interactive Demo Sandbox from the Live Institutional Production Portal using dedicated URLs (`/demo` and `/login`), backend sandbox data isolation, and enterprise-grade security hardening for live school operations.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed via interactive requirements clarification:
>
> - **URL Separation**: Dedicated separate routes: `/demo` for instant sandbox portal testing and `/login` for the live secure institutional gateway.
> - **Backend Data Isolation**: Dedicated `is_demo` sandbox flag isolating synthetic demo accounts, preventing demo sessions from writing to or modifying live school databases.
> - **Live Security Posture**: Live institutional logins enforce full Two-Factor Authentication (2FA), rigorous brute-force account lockouts (5 failed attempts), and strict dual-key rate limiting.

---

## 1. Overview & Core Concept

### What It Delivers
This feature creates a clean, architectural separation between:
1. **Interactive Demo Testing Portal (`/demo`)**: A rapid-evaluation sandbox where prospective clients, school boards, evaluators, and QA testers can test all four portals (Super Admin, Faculty/Teacher, Parent & Guardian, Student) with one-click auto-fill, synthetic sample data, and zero 2FA friction.
2. **Live Institutional Production Gateway (`/login`)**: A hardened institutional entrance for real school personnel, parents, and students with strict domain enforcement, database-backed 2FA email challenges, rate limiting, and session security.

### Target Personas
- **Prospective School Administrators & Evaluators**: Need to test workflows (timetables, grading, admissions, attendance) without configuring real emails or phone numbers.
- **Real School Staff, Teachers, Parents, and Students**: Require production-grade protection for children's educational, financial, and personal records.

---

## 2. User Experience & Visual Design

### Key User Flows

#### Flow A: Testing in the Demo Sandbox (`/demo` or `#/demo`)
```
[User visits /demo] ──> [Sandbox Banner: "Interactive Evaluation Environment"]
                           │
                           ├──> [Select Portal Tab: Admin / Teacher / Parent / Student]
                           ├──> [Click "1-Click Launch" / Auto-fill]
                           └──> [Instant Entry into Portal with Synthetic Sample Data]
```
- **Visual Atmosphere**: Slate `#0F172A` backdrop with high-contrast portal accents (Emerald for Parents, Royal Blue for Teachers, Royal Purple for Admin, Indigo for Students).
- **Clear Sandbox Badge**: Top-level sticky status bar indicating `"DEMO SANDBOX — SYNTHETIC DATA MODE"`, with a direct quick link to `"Switch to Live Institutional Login"`.

#### Flow B: Live Institutional Production Access (`/login` or `#/login`)
```
[User visits /login] ──> [Enterprise Secure Header: "Greenwood Institutional Portal"]
                           │
                           ├──> [Enters Official School Email / Admission ID & Password]
                           ├──> [Server verifies institutional credentials]
                           ├──> [2FA Challenge Triggered: 6-Digit Email OTP dispatched]
                           ├──> [User enters OTP from verified mailbox]
                           └──> [Authenticated Session issued to Live School Dashboard]
```
- **Visual Atmosphere**: Sophisticated institutional styling, clean typography (`Plus Jakarta Sans`), no demo credential shortcuts, no auto-fill badges, quiet unboxed security badges with WCAG AA compliance.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Dedicated URLs vs Single Toggle
- **Chosen Approach**: Distinct route handlers (`/demo` and `/login`) with synchronized hash-routing support (`#/demo` and `#/login`).
- **Why**: Eliminates accidental credential entry into the demo sandbox and allows school domains to bookmark `/login` directly for staff and parents.
- **Alternative Considered**: Single page modal toggle — rejected because it risks accidental cross-contamination and confuses external evaluators.

### Decision 2: Backend Sandbox Tagging vs Separate Database
- **Chosen Approach**: Single database with strict `is_demo: boolean` column and environment validation flag (`ALLOW_DEMO_LOGINS`).
- **Why**: Allows instant zero-maintenance previews and local tests without spinning up secondary database containers, while maintaining strict query isolation.
- **Alternative Considered**: Dual databases — rejected for current demo architecture complexity, but architected so connection strings can be cleanly separated in the future.

### Decision 3: Strict Route Separation on Backend
- **Chosen Approach**: Two dedicated backend auth endpoints:
  - `POST /api/auth/demo-login`: Accepts only flagged demo identifiers (`admin@school.com`, `teacher.adewale@school.com`, etc.), automatically rejected if `ALLOW_DEMO_LOGINS !== 'true'`.
  - `POST /api/auth/live-login`: Rejects all synthetic demo accounts, enforces database 2FA verification on administrative accounts, and triggers account-level lockout counters.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT ROUTER                                   │
│                                                                             │
│         /demo (or #/demo)                        /login (or #/login)        │
│   ┌───────────────────────────┐            ┌───────────────────────────┐    │
│   │    DemoSandboxView        │            │    LiveInstitutionalView  │    │
│   │ ───────────────────────── │            │ ───────────────────────── │    │
│   │ • 4 Portal Switcher Tabs  │            │ • Strict Institutional UI │    │
│   │ • 1-Click Sandbox Logins  │            │ • No Demo Shortcuts       │    │
│   │ • Bypassed 2FA Verification│            │ • Full 2FA OTP Prompt     │    │
│   └─────────────┬─────────────┘            └─────────────┬─────────────┘    │
└─────────────────┼────────────────────────────────────────┼──────────────────┘
                  │                                        │
                  ▼                                        ▼
    POST /api/auth/demo-login                POST /api/auth/live-login
┌─────────────────────────────────┐      ┌────────────────────────────────────┐
│      DEMO AUTH CONTROLLER       │      │       LIVE AUTH CONTROLLER         │
│ ─────────────────────────────── │      │ ────────────────────────────────── │
│ • Validates ALLOW_DEMO flag     │      │ • Rejects Demo Email Suffixes      │
│ • Restricts to is_demo accounts │      │ • Dual-Key Rate Limiting (IP + Acc)│
│ • Direct JWT token emission     │      │ • Enforces Database 2FA Sessions   │
│ • Audit log: DEMO_SANDBOX_LOGIN │      │ • Audit log: SECURE_LIVE_LOGIN     │
└────────────────┬────────────────┘      └─────────────────┬──────────────────┘
                 │                                         │
                 └──────────────────┬──────────────────────┘
                                    ▼
                         ┌──────────────────────┐
                         │   POSTGRESQL / ORM   │
                         │ ──────────────────── │
                         │ • users (is_demo)    │
                         │ • 2fa_sessions       │
                         │ • audit_logs         │
                         └──────────────────────┘
```

### Data Model Enhancements
1. **Users Table (`src/db/schema.ts`)**:
   - `isDemo: boolean` (default `false`, indexed)
   - `failedLoginAttempts: integer` (default `0`)
   - `lockedUntil: timestamp` (nullable)
2. **Audit Logs (`audit_logs`)**:
   - Distinct classification between `DEMO_SANDBOX_ACCESS` and `LIVE_INSTITUTIONAL_LOGIN`.

---

## 5. Verification & Testing Plan

### Automated Regression & Security Test Matrix
- **Test 1**: Verify `POST /api/auth/demo-login` succeeds for `admin@school.com` without 2FA.
- **Test 2**: Verify `POST /api/auth/demo-login` rejects non-demo arbitrary email accounts.
- **Test 3**: Verify `POST /api/auth/live-login` rejects `admin@school.com` with HTTP 403 Forbidden.
- **Test 4**: Verify `POST /api/auth/live-login` for real admin accounts initiates mandatory database-backed 2FA.
- **Test 5**: Verify client route navigation between `/demo` and `/login` preserves portal selection and isolation.

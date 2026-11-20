# Security Specification — Akasha Alliance (Airlines of The Moon)

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every Firestore path not explicitly matched is denied for all reads and writes.
2. **Strict Admin-Only Read Confidentiality (`moonEventSubmissions`)**: Submitted event entries—including financial numbers, emails, and uploaded photos (`profitPhotoDataUrl`, `airlinePhotoDataUrl`)—contain private participant data. Only verified admin (`email_verified == true && email == 'ridwan8873@gmail.com'` or `/admins/$(request.auth.uid)`) may `get`, `list`, `update`, or `delete` submissions. Non-admin users cannot read their own or others' submissions once submitted.
3. **Verified Identity & Anti-Spoofing (`create`)**: Any verified Google user (`request.auth != null && request.auth.token.email_verified == true`) may create a submission, provided `submittedByUid == request.auth.uid`, `submittedByEmail == request.auth.token.email`, `createdAt == request.time`, and `updatedAt == request.time`.
4. **Strict Payload & Volumetric Bounds**: All 13 required keys must be present (`hasAll`) and only whitelisted keys (`hasOnly`) are permitted (optional server-signed `aiScore`, `aiRecommendedStatus`, `aiPhotoMatchStatus`, `aiTop1Eligible`, `aiSummaryNote`, `aiSignature` on `create`; `judgeStatus`, `adminScore`, `adminNote` strictly admin-only on `update`). Every string enforces `min/max` length, photos must begin with `data:image/` and stay `<= 350000` chars (so 2 photos + text stay safely under the 1 MiB document cap), and numeric financials are bounded.
5. **Path Hardening**: All single-document operations (`get`, `create`, `update`, `delete`) validate `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$`, max 128 chars).
6. **AI Signature Anti-Tampering**: Even if a client attempts to forge `aiScore` or `aiSignature` on `create`, official `adminScore` and `judgeStatus` remain forbidden on `create`, and the Admin Vault verifies every `aiSignature` via server-side HMAC-SHA256 (`/api/ai/verify-submission-eval`) before promoting any pre-evaluation score—automatically re-evaluating tampered or unsigned items via Gemini AI.

7. **Strict Admin-Only Visitor Monitoring (`siteVisitors`)**: Visitor presence and entry logs—including Google account email/name, device/browser details, and entry timestamps—are strictly readable (`get`, `list`) and deletable (`delete`) only by verified admins (`isAdmin()`). Guests may only create/update their own `guest_*` ID (`visitorType == 'guest'`, no `uid`/`email`/`avatarUrl`), and verified Google users may only create/update `user_<auth.uid>` with immutable `firstEnteredAt == request.time`, server-enforced `lastSeenAt == request.time`, and bounded `visitCount` increments (`0` or `+1`).

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Create**: Anonymous/logged-out client attempts `create` on `/moonEventSubmissions/sub1`.
2. **Unverified Email Create**: User with `email_verified: false` attempts `create` on `/moonEventSubmissions/sub1`.
3. **UID Spoofing**: User `uid_A` submits `submittedByUid: "uid_B"`, or guest/user attempts `siteVisitors/user_other` with spoofed `uid`/`email`/`visitorType: "admin"`.
4. **Email Spoofing (Non-Admin Read)**: Attacker sets `token.email: "ridwan8873@gmail.com"` with `email_verified: false` and attempts `get` or `list` on `/moonEventSubmissions` or `/siteVisitors`.
5. **Participant Read Scraping**: Verified non-admin participant attempts `list` or `get` on `/moonEventSubmissions` or `/siteVisitors` (even with `where` filters).
6. **Shadow Ghost Field Injection**: Valid user injects extra field `isWinner: true` or `approved: true` on `create` (or extra keys in `siteVisitors`).
7. **Timestamp Forgery**: Client sends custom past/future timestamp for `createdAt`, `updatedAt`, `firstEnteredAt`, or `lastSeenAt` instead of `request.time`.
8. **Document ID Poisoning**: Client writes to `/moonEventSubmissions/` or `/siteVisitors/` with a 200-char or invalid ID like `bad/id$123`.
9. **Resource Exhaustion (Oversized Photo)**: Client sends a 600,000-char string in `profitPhotoDataUrl` (exceeds 350,000 bound).
10. **Non-Image Photo Spoof**: Client sends `"https://evil.example/fake"` or `"javascript:alert(1)"` instead of a `data:image/` string in `airlinePhotoDataUrl`.
11. **Privilege Escalation**: Verified non-admin attempts `create` on `/admins/{uid}` or sets `visitorType: "admin"` in `/siteVisitors`.
12. **Immutable Field Mutation**: Admin or user attempts `update` changing `createdAt`, `submittedByUid`, `firstEnteredAt`, or jumping `visitCount` by more than `+1`.

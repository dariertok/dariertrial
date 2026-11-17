# SkyTrail Firestore Security Specification

## 1. Data Invariants
1. **Owner-Only Profile & PII Isolation (`/users/{userId}`)**: A user profile document containing email and display name can only be created, read, updated, or deleted when `request.auth != null`, `request.auth.token.email_verified == true`, `request.auth.uid == userId`, and `isValidId(userId)`.
2. **Master Gate Parent Existence**: Every subcollection write and read under `/users/{userId}/settings/{settingId}`, `/users/{userId}/routes/{routeId}`, and `/users/{userId}/gear/{gearDocId}` requires parent `/users/{userId}` to exist via `exists(/databases/$(database)/documents/users/$(userId))`.
3. **Immutable Ownership & Creation Timestamps**: `uid`, `userId`, `id`, and `createdAt` cannot be modified after creation (`incoming().createdAt == existing().createdAt`, `incoming().userId == existing().userId`).
4. **Strict Server Time & Enum Constraints**: All `createdAt`/`updatedAt` timestamps must equal `request.time`. Settings fields (`bikeType`, `colorTheme`, `bgMode`, `weatherProvider`, `speedKmH`, `breakMinutes`) and route `points` list sizes (`2..2500`) are strictly bounded.
5. **Query Security Enforcement**: Listing `/users/{userId}/routes` enforces `resource.data.userId == request.auth.uid`.

## 2. "Dirty Dozen" Attack Payloads (Expected: `PERMISSION_DENIED`)
1. Unauthenticated read on `/users/{uid}` -> Denied (`request.auth == null`).
2. Cross-user read on `/users/{otherUid}/settings/preferences` -> Denied (`request.auth.uid != otherUid`).
3. Unverified email spoofing (`email_verified == false`) on create -> Denied (`isSignedIn()`).
4. Shadow field injection (`{ isAdmin: true }` in `/users/{uid}`) -> Denied (`keys().hasOnly(...)`).
5. Orphaned route creation when `/users/{uid}` does not exist -> Denied (`exists(...)`).
6. Cross-owner route `userId` spoofing (`userId: "victim"`) -> Denied (`data.userId == userId`).
7. Invalid document ID poisoning (`1.5KB` string or `/` characters) -> Denied (`isValidId()`).
8. Client-forged timestamp (`createdAt: "2020-01-01"`) -> Denied (`incoming().createdAt == request.time`).
9. Mutating `createdAt` on route update -> Denied (`incoming().createdAt == existing().createdAt`).
10. Excessive route `points` array (>2500 elements) or non-map element -> Denied (`data.points.size() <= 2500 && data.points[0] is map`).
11. Out-of-bounds speed (`speedKmH: 999`) or invalid `weatherProvider` enum -> Denied (`isValidUserSettings()`).
12. Listing `/users` root collection or `/users/{uid}/settings` -> Denied (`allow list: if false`).

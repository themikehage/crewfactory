COMPLETED
# Plan: Better Auth Integration & First-Run Onboarding


## Vision
Replace the custom JWT+bcrypt single-user auth with **Better Auth** for a self-hosted experience like Coolify: the user accesses the app URL, creates their admin account on first run, and logs in normally afterwards. Zero env-var management for credentials -- secrets are auto-generated and persisted on disk.

## Why Better Auth
- Self-hosted, MIT license, runs in-process (no separate service)
- Cookie-based sessions (httpOnly, secure) -- more secure than localStorage JWT
- Built-in sign-up, sign-in, sign-out, session management
- SQLite support via better-sqlite3 (Bun-compatible, zero external deps)
- Hono-native middleware integration
- Plugin ecosystem: 2FA, passkeys, OAuth, organizations (future-proof)
- ~29k GitHub stars, actively maintained

## Architecture

```
┌─────────────────────────────────────────┐
│  CrewFactory Docker Container           │
│                                         │
│  /app/data/                             │
│  ├── crewfactory.db       (SQLite)      │
│  ├── .auth-secret         (auto-gen)    │
│  └── users/               (existing)    │
│                                         │
│  Server (Hono + Bun)                    │
│  ├── auth.ts (better-auth config)       │
│  ├── middleware (session-based)         │
│  └── routes (protected + public)       │
└─────────────────────────────────────────┘
```

## Phases

### Phase 1: Database & Dependencies
- [ ] **1.1** Install `better-auth` and `better-sqlite3` in `apps/server`
- [ ] **1.2** Create `apps/server/src/auth/db.ts` -- SQLite database singleton at `/app/data/crewfactory.db` (path from `CREWFACTORY_DATA_PATH` env)
- [ ] **1.3** Run Better Auth schema migration on startup (`npx @better-auth/cli migrate` or programmatic `auth.$Infer`)
- [ ] **1.4** Create `apps/server/src/auth/index.ts` -- better-auth instance configuration

### Phase 2: Secret Auto-Generation
- [ ] **2.1** Create `apps/server/src/auth/secret.ts` -- `getOrCreateAuthSecret()` function
  - Check for `/app/data/.auth-secret` file
  - If missing, generate with `crypto.randomBytes(32).toString("base64")`
  - Persist to file, chmod 600
- [ ] **2.2** Wire into server startup in `apps/server/src/index.ts`
- [ ] **2.3** Remove `JWT_SECRET`, `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` from required env vars in docker-compose
- [ ] **2.4** Keep `JWT_SECRET` as optional fallback for encrypted data (`env.json`, `auth.json`) that use JWT_SECRET-derived key

### Phase 3: Better Auth Server Configuration
- [ ] **3.1** Create `apps/server/src/auth/config.ts` -- `createAuth()` factory
  - Database: SQLite via better-sqlite3 adapter
  - emailAndPassword: enabled, password hash with bcryptjs (reuse existing dep)
  - User schema: add `username` custom field, `role` (admin/user)
  - Session: 7 day expiry, cookie-based, secure in production
  - Trusted origins: derive from request or env
- [ ] **3.2** Mount `auth.handler()` on `/api/auth/*` in `apps/server/src/index.ts`
- [ ] **3.3** Create `apps/server/src/auth/middleware.ts` -- Better Auth Hono middleware
  - Extracts session from request headers/cookies
  - Sets `c.set("user", session.user)` and `c.set("session", session.session)`
  - Compatible with existing `getUsername()` helper pattern
- [ ] **3.4** Configure CORS for auth endpoints with `credentials: true`

### Phase 4: Username-Based Auth (No Email Required)
- [ ] **4.1** Implement `signUpUsername` endpoint / custom flow
  - UI collects username + password (email optional)
  - If no email provided, generate internal email: `${username}@crewfactory.internal`
  - Store username as custom field on user record
- [ ] **4.2** Implement `signInUsername` endpoint / custom flow
  - Look up user by username custom field
  - Call Better Auth's `signIn.email()` with the internal email
- [ ] **4.3** Create `apps/server/src/routes/auth.ts` v2 with:
  - `POST /api/auth/register` -- username + password (public, only if no users exist)
  - `POST /api/auth/login` -- username + password (public)
  - `POST /api/auth/logout` -- clears session (authenticated)
  - `GET /api/auth/me` -- returns current user (authenticated)
  - `POST /api/auth/change-password` -- change password (authenticated)

### Phase 5: First-Run Onboarding Middleware
- [ ] **5.1** Create `apps/server/src/auth/onboarding.ts` -- `isFirstRun()` check
  - Query Better Auth user count from SQLite
  - Returns true if zero users + no legacy credentials exist
- [ ] **5.2** Create `GET /api/auth/status` endpoint
  - Returns `{ needsSetup: boolean, authenticated: boolean, user: ... }`
  - Used by frontend to decide which page to render
- [ ] **5.3** Add onboarding guard in `AppRouter.tsx`
  - If `needsSetup`, show OnboardingPage exclusively
  - If authenticated, show dashboard
  - If not authenticated and not needsSetup, show LoginPage

### Phase 6: Client Migration
- [ ] **6.1** Create `apps/client/src/lib/auth-client.ts` -- Better Auth client singleton
  - `createAuthClient({ baseURL: window.location.origin + "/api/auth" })`
  - Export reactive hooks: `useSession`, `signIn`, `signUp`, `signOut`
- [ ] **6.2** Create `apps/client/src/contexts/AuthContext.tsx` v2
  - Use Better Auth's `useSession()` hook
  - Maintain `loading`, `user`, `session` state
  - `login(username, password)` → calls custom `/api/auth/login` endpoint
  - `register(username, password, email?)` → calls `/api/auth/register`
  - `logout()` → calls `authClient.signOut()` + clear localStorage app data
  - `changePassword(current, new)` → calls `/api/auth/change-password`
- [ ] **6.3** Create `apps/client/src/pages/OnboardingPage.tsx`
  - Clean, centered card with app branding
  - Fields: username, password, confirm password
  - Optional: email (for recovery)
  - Submit creates account, auto-logs in, redirects to dashboard
  - Mobile-first responsive
- [ ] **6.4** Update `apps/client/src/pages/LoginPage.tsx`
  - Switch to username field (not email)
  - Add link to "Forgot password?" (future)
  - Keep existing design tokens and animations
- [ ] **6.5** Update `apps/client/src/lib/api.ts` -- HTTP interceptor
  - Better Auth uses httpOnly cookies, no Bearer token needed
  - Set `credentials: "include"` on all fetch calls
  - Keep 401 handler to dispatch `auth-unauthorized` event
- [ ] **6.6** Update `apps/client/src/lib/ws-client.ts` -- WebSocket auth
  - Option A: Send session token extracted from cookie
  - Option B: Use `authClient.getSession()` and send session token
  - On server: verify session token with Better Auth
- [ ] **6.7** Update `apps/client/src/components/layout/AppRouter.tsx`
  - Three-way routing: OnboardingPage | LoginPage | Dashboard
  - Based on `/api/auth/status` response

### Phase 7: Server Route Migration
- [ ] **7.1** Create `apps/server/src/auth/guards.ts`
  - `authGuard(c, next)` -- blocks if no valid session
  - `adminGuard(c, next)` -- blocks if user role !== "admin"
  - `optionalAuth(c, next)` -- populates user if session exists, passes through otherwise
- [ ] **7.2** Migrate all `use("/*")` authMiddleware routes to use Better Auth session middleware
  - `/api/sessions/*`, `/api/providers/*`, `/api/skills/*`, `/api/env/*`
  - `/api/integrations/*`, `/api/preview/*`, `/api/agents/*`, `/api/channels/*`
  - `/api/backup/*`, `/api/logs/*`, `/api/mcp/*`, `/api/experiments/*`
  - `/api/settings/*`, `/api/gallery/*`, `/api/factory/*`
- [ ] **7.3** Update `/api/files/*` and `/api/preview/*` to use session-based auth
  - Replace `getUsername()` query-param token with session cookie
  - For `<img>` tags and file downloads: support session cookie OR keep `?token=` for compatibility
- [ ] **7.4** Update WebSocket handler (`apps/server/src/ws/handler.ts`)
  - On connect: parse session from upgrade request cookies
  - Verify with `auth.api.getSession({ headers })`
  - Keep existing `auth` message type for backward compatibility
- [ ] **7.5** Update `apps/server/src/lib/auth-helpers.ts`
  - `getUsername(c)` → extract username from Better Auth session context
  - Keep `?token=` support for image/file URLs if needed

### Phase 8: Data Encryption Key Migration
- [ ] **8.1** The AES-256-GCM encryption for `env.json` and `auth.json` currently derives from `JWT_SECRET`
  - Better Auth has its own `BETTER_AUTH_SECRET`
  - Derive encryption key from `BETTER_AUTH_SECRET` instead of `JWT_SECRET`
  - Add migration: if env.json can't decrypt with new key, try old `JWT_SECRET`-derived key
- [ ] **8.2** Update `env-crypto.ts` to accept configurable secret source

### Phase 9: Legacy Migration & Backward Compatibility
- [ ] **9.1** Create `apps/server/src/auth/migration.ts` -- migrate from legacy auth
  - Detect if `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` env vars are set
  - If yes and Better Auth has no users, auto-create user account
  - Use the legacy username + a new random password
  - Log warning that password should be changed via UI
  - Mark as migrated to prevent re-creation on restart
- [ ] **9.2** Handle existing `credentials.json` per-user password hash
  - If found, migrate to Better Auth account (enable multi-user from legacy single-user data)

### Phase 10: Environment & Docker Updates
- [ ] **10.1** Update `.env.example` -- remove `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `JWT_SECRET`
  - Add `BETTER_AUTH_URL` (optional, defaults to `http://localhost:3000`)
  - Keep `CREWFACTORY_DATA_PATH=/app/data` and AI provider keys
- [ ] **10.2** Update `docker-compose.yml` -- remove auth env var requirements
  - Only require AI provider keys (optional)
  - `BETTER_AUTH_URL` with sensible default
- [ ] **10.3** Update `Dockerfile` -- no changes needed, auth is file-based
- [ ] **10.4** Update `scripts/docker-entrypoint.sh` -- ensure data directory permissions for SQLite

### Phase 11: Polish & Security
- [ ] **11.1** Add rate limiting on auth endpoints (using Better Auth's built-in rate limiter plugin)
- [ ] **11.2** Add session list + revocation in Settings UI (see active sessions, sign out others)
- [ ] **11.3** Add account deletion in Settings
- [ ] **11.4** Password strength validation (min 8 chars, mix of types)
- [ ] **11.5** Username uniqueness validation with nice error messages
- [ ] **11.6** Better Auth admin API endpoints for user management
- [ ] **11.7** Audit logs for auth events (login, logout, password change)
- [ ] **11.8** Test full flow: first-run → register → login → password change → session persistence → logout → login

### Phase 12: Cleanup
- [ ] **12.1** Remove old `jsonwebtoken` dependency (only keep if needed for encrypted data key fallback)
- [ ] **12.2** Remove old auth middleware file (keep copy in git history)
- [ ] **12.3** Remove old credential-based auth logic from `user-config.ts`
- [ ] **12.4** Update `about.md` with new auth architecture
- [ ] **12.5** Verify full compilation and test both client and server builds

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | SQLite (better-sqlite3) | Zero external deps, Bun-compatible, single-container friendly |
| Auth mode | email+password with username field | Better Auth requires email; we generate internal email from username |
| Session storage | httpOnly cookies | More secure than localStorage JWT, automatic expiry |
| Secret generation | Auto-generated on first start, stored in /app/data/.auth-secret | No env var management needed |
| Password hashing | bcryptjs (existing dep) | Keep what works, configure Better Auth custom hash |
| Multi-user | Enabled by default | Better Auth supports it; admin role for first user |
| Legacy support | Auto-migrate if AUTH_USERNAME env var is set | Backward compatible for existing deployments |
| Encryption key | Derive from BETTER_AUTH_SECRET | Consistent secret source, remove JWT_SECRET dependency |

## User Flow

### First Run
```
User opens http://localhost:3000
  → GET /api/auth/status returns { needsSetup: true }
  → OnboardingPage renders
  → User enters username + password (email optional)
  → POST /api/auth/register
  → Account created, session cookie set
  → Redirect to dashboard
```

### Subsequent Visits
```
User opens http://localhost:3000
  → GET /api/auth/status returns { needsSetup: false, authenticated: false }
  → LoginPage renders (if no valid session cookie)
  → Or dashboard renders (if valid session cookie)
```

### Login
```
User enters username + password
  → POST /api/auth/login
  → Better Auth validates credentials
  → Session cookie set
  → Redirect to dashboard
```

## Files to Create/Modify

### New Files
- `apps/server/src/auth/index.ts` -- Better Auth instance + exports
- `apps/server/src/auth/db.ts` -- SQLite database setup
- `apps/server/src/auth/config.ts` -- Better Auth configuration factory
- `apps/server/src/auth/middleware.ts` -- Session middleware for Hono
- `apps/server/src/auth/guards.ts` -- authGuard, adminGuard, optionalAuth
- `apps/server/src/auth/secret.ts` -- Secret generation and persistence
- `apps/server/src/auth/onboarding.ts` -- First-run detection
- `apps/server/src/auth/migration.ts` -- Legacy auth migration
- `apps/client/src/lib/auth-client.ts` -- Better Auth client setup
- `apps/client/src/pages/OnboardingPage.tsx` -- First-run registration UI

### Modified Files
- `apps/server/src/index.ts` -- Mount auth handler, session middleware
- `apps/server/src/routes/auth.ts` -- Rewrite with Better Auth endpoints
- `apps/server/src/middleware/auth.ts` -- Keep temporarily, replace with session middleware
- `apps/server/src/lib/auth-helpers.ts` -- Update getUsername()
- `apps/server/src/lib/env-crypto.ts` -- Using BETTER_AUTH_SECRET
- `apps/server/src/ws/handler.ts` -- Session-based WS auth
- `apps/server/src/core/session/user-config.ts` -- Remove password hash storage
- `apps/client/src/contexts/AuthContext.tsx` -- Better Auth client wrapper
- `apps/client/src/pages/LoginPage.tsx` -- Username-based login
- `apps/client/src/lib/api.ts` -- Cookie-based auth, credentials: include
- `apps/client/src/lib/ws-client.ts` -- Session token for WS auth
- `apps/client/src/components/layout/AppRouter.tsx` -- Three-way routing
- `.env.example` -- Remove auth env vars
- `docker-compose.yml` -- Remove auth env var requirements
- `about.md` -- Update auth section

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| better-sqlite3 native module | Bun needs native module support | Bun supports better-sqlite3 natively; verify on Docker build |
| Cookie-based auth breaks file/image URLs | `<img>` tags can't send cookies with `credentials: include` | Keep `?token=` query param using session token as fallback |
| WebSocket cookie access | Upgrade request may not include cookies in all clients | Use session token in handshake message as primary method |
| Migration breaks existing deployments | Users can't log in after upgrade | Auto-detect legacy env vars, auto-migrate admin account |
| Encryption key change breaks env.json/auth.json | User loses provider keys and env vars | Try both old and new key derivation, migrate on successful decrypt |

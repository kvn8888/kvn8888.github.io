# Building a Sign-In Manager from Scratch — Approval Queues, Verification Codes, and the Auth Layer Nobody Teaches You

My portfolio site had a binary auth system: you're on the email whitelist, or you're not. That's fine when it's just me, but it falls apart the moment you want to demo something to a friend. "Hey, check out this tool I built" becomes "Hey, send me your Gmail address and wait while I redeploy with a new environment variable." I wanted a door that people could knock on — and I wanted to be the one who decides whether to open it.

This is the story of building a complete sign-in manager: email verification with one-time codes, a pending approval queue, an admin dashboard, and the database integration to wire it all together. By the end, you'll be able to build the same thing on your own stack.

---

## The Starting Point

The existing auth was Auth.js v5 (the `next-auth@beta` package) with Google OAuth. The entire authorization logic was seven lines:

```typescript
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",").map((e) => e.trim().toLowerCase())

// In the signIn callback:
signIn({ profile }) {
  if (!profile?.email) return false
  return ALLOWED_EMAILS.includes(profile.email.toLowerCase())
}
```

Static whitelist, loaded once at startup from a comma-separated environment variable. Adding a user meant editing `ALLOWED_EMAILS` in the Vercel dashboard and redeploying. Removing one was the same. No audit trail, no pending state, no way to know who *tried* to sign in and got bounced.

The middleware (in `src/proxy.ts`) protected all `/projects/*` routes and redirected unauthenticated users to a sign-in page with one button: "Continue with Google." If your email wasn't in the list, you got a cryptic Auth.js error redirect and nothing else.

**What I wanted:**

1. A second sign-in method — enter your email, get a 6-digit code, prove you own the inbox
2. A pending state — after verification, you see "an admin will review your access" instead of a wall
3. An admin dashboard at `/projects/logins` where I can approve or reject each attempt
4. A manual whitelist button so I can retroactively add people
5. Everything stored in a database, not environment variables

---

## Step 1: Choosing the Database Layer

I already had `@libsql/client` in `package.json` and a Turso client helper in `src/lib/turso.ts` — leftover from a usage monitoring dashboard that tracked Turso's own API metrics. Turso is a managed SQLite service: your data lives in a libSQL database (a SQLite fork), and you talk to it over HTTP with a lightweight client library. No connection pooling to worry about, no ORM to configure, and the free tier handles millions of reads per month.

For this feature, I needed exactly one table:

```sql
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'email',
  verification_code TEXT,
  code_verified INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

One table does triple duty: it's the verification code store, the approval queue, and the whitelist. The `method` column distinguishes how someone arrived (`'email'`, `'google'`, or `'manual'` for admin-added entries). The `status` column (`'pending'`, `'approved'`, `'rejected'`) is the access control gate.

**Design decision:** I used lazy schema initialization instead of a migration tool. The first database call triggers `CREATE TABLE IF NOT EXISTS`. This is fine for a single-table personal project. If you have multiple tables, foreign keys, or a team — use a real migration system (Drizzle, Prisma Migrate, or plain SQL files with version tracking). I didn't because the overhead wasn't worth it for one table.

**The helper file** (`src/lib/db.ts`) exports focused functions: `createLoginAttempt()`, `verifyCode()`, `getLoginAttempts()`, `updateAttemptStatus()`, `isEmailApproved()`, `addWhitelistEmail()`, and `generateVerificationCode()`. Every function gets its own Turso client via `getTursoClient()`, which returns `null` if the env vars aren't set — making the whole feature degrade gracefully. No Turso? The sign-in page still works with Google SSO and the env var whitelist. The admin dashboard shows an empty state. Nothing crashes.

---

## Step 2: The Verification Code Flow

The sign-in page needed to go from one button to two sign-in methods without looking cluttered. I kept the Google button at the top and added an "or" divider followed by an email input:

```tsx
<div className="flex items-center gap-3 my-6">
  <div className="flex-1 h-px bg-glass-border" />
  <span className="text-xs text-foreground/40 uppercase tracking-wider">or</span>
  <div className="flex-1 h-px bg-glass-border" />
</div>
<EmailVerification />
```

The `EmailVerification` component is a client component (it needs `useState` for the multi-step flow) with three states: `email` → `code` → `pending`.

**Step 1: User enters email.** The form POSTs to `/api/auth/verify/request`. The API route generates a 6-digit code using `crypto.getRandomValues()` (not `Math.random()` — cryptographic randomness matters even for demo codes), stores it in Turso, and returns the code in the response.

```typescript
export function generateVerificationCode(): string {
  const chars = '0123456789'
  let code = ''
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  for (let i = 0; i < 6; i++) {
    code += chars[array[i] % 10]
  }
  return code
}
```

**"Wait, you're returning the code to the client?"** Yes. This is a demo. In production, you'd send the code via email (SendGrid, Resend, AWS SES — pick your poison) and *not* return it in the API response. But for demoing the flow to friends sitting next to you, displaying the code on screen lets them experience the full UX without needing email infrastructure. The green banner makes it obvious:

```
Demo mode — your verification code:
    4 8 2 7 1 5
```

**Step 2: User enters code.** The form POSTs to `/api/auth/verify/confirm`. The API checks the most recent attempt for that email, compares codes, and marks `code_verified = 1` if they match. The client transitions to the pending state.

**Step 3: Pending screen.** An amber hourglass icon, the user's email, and a message: "An admin will review and approve your access." That's it. No retry button, no countdown. They've done their part.

**An important nuance:** the code verification flow is intentionally separate from Auth.js sessions. The user doesn't get a JWT. They don't get access to `/projects/*`. They've simply proven they own an email address and placed themselves in an approval queue. The actual "signing in" still requires Google OAuth — but now, when an approved user signs in with Google, the `signIn` callback checks Turso and finds their approved status.

---

## Step 3: Modifying the Auth Callback

This was the most delicate change. The Auth.js `signIn` callback is the single gatekeeper for all access. The original returned a boolean. The new version has three tiers:

```typescript
async signIn({ profile }) {
  if (!profile?.email) return false
  const email = profile.email.toLowerCase()

  // Tier 1: Owner accounts (env var whitelist, unchanged)
  if (ALLOWED_EMAILS.includes(email)) return true

  // Tier 2: Database-approved emails
  const approved = await isEmailApproved(email)
  if (approved) return true

  // Tier 3: Log the attempt for admin review
  await createLoginAttempt(email, 'google')
  return false
},
```

The keyword `async` is the only syntax change to the function signature, but it changes everything. Previously, `signIn` was synchronous — a pure array lookup. Now it hits the database. That means every Google sign-in attempt makes a Turso query. For a personal portfolio, this is fine. For a high-traffic app, you'd want caching (check the env whitelist first, which is O(1) in-memory, and only hit the DB on cache miss — which is already what this code does).

**Why this ordering matters:** Tier 1 is the fast path. My own email never touches the database. Tier 2 is the warm path — one indexed query. Tier 3 is the cold path — a write, and it always returns `false`. An attacker trying to flood the approval queue would need valid Google OAuth tokens, which limits the blast radius.

**Handling the rejection gracefully:** When `signIn` returns `false`, Auth.js redirects to the sign-in page with `?error=AccessDenied`. Previously, this showed the same sign-in form with no explanation. Now, the sign-in page detects the error parameter and renders a pending approval screen instead:

```tsx
const { error } = await searchParams
const wasRejected = error === "AccessDenied" || error === "Callback"

{wasRejected ? (
  <PendingApprovalMessage />
) : (
  <SignInForm />
)}
```

This means a friend who tries to sign in with Google and isn't approved yet sees: "Your sign-in request has been recorded. An admin will review and approve your access." — not a raw error code.

---

## Step 4: The Admin Dashboard

The admin page at `/projects/logins` is a client component that fetches from `/api/logins`. It's behind the existing middleware, so only authenticated users (i.e., me) can see it. The API routes also check `auth()` — defense in depth.

The dashboard has four parts:

**1. Filter tabs** — All / Pending / Approved / Rejected, with live counts. Clicking a tab filters client-side. No new API calls.

**2. Attempt list** — Each row shows the email, the method badge (Google icon, email icon, or person-add icon for manually whitelisted), a timestamp, a status badge, and action buttons. Pending attempts get Approve (green check) and Reject (red X) buttons.

**3. Add Email button** — Opens an inline form to manually whitelist an email. This creates an `'approved'` entry with method `'manual'` in the database. The use case: someone tells me their email in person, and I add them before they even try to sign in.

**4. Status badge styling** — Uses the existing dark-mode-aware status color overrides from `globals.css`. The amber/emerald/red backgrounds and borders all work in both light and dark mode because the CSS already handles the class overrides.

The API follows the pattern established by the usage monitoring routes: `GET` for listing, `POST` for creating, `PATCH` for updating. The `PATCH /api/logins/[id]` route accepts `{ status: 'approved' | 'rejected' }` and validates the input before writing.

---

## The Gotcha: Server Components vs. Client Components at the Auth Boundary

The sign-in page was originally a server component — it used `signIn` from Auth.js as a server action. Adding the email verification flow meant adding `useState` and `fetch()`, which require a client component. But the Google sign-in button uses a server action (`await signIn("google")`), which can only be defined in a server component.

The solution: keep the page as a server component and extract the email verification into a separate client component (`EmailVerification.tsx`). The server component renders the Google button with its server action, the divider, and then mounts the client component below. This is the canonical pattern for mixing server actions with client interactivity in Next.js App Router, but it trips up everyone the first time.

```
SignInPage (Server Component)
├── Google Sign-In Button (server action: signIn("google"))
├── "or" divider
└── <EmailVerification /> (Client Component with useState, fetch)
```

If you try to put `"use server"` inside a `"use client"` file, you'll get a build error. If you try to put `useState` in a server component, you'll get a different build error. The boundary is strict, and the only escape hatch is component composition.

---

## What's Next

**Email delivery.** The verification code is currently displayed on screen. Plugging in Resend or SendGrid to actually email the code is straightforward — the API route already generates and stores the code, you'd just add an email send call before the response and remove the code from the JSON body.

**Rate limiting.** There's nothing stopping someone from hitting `/api/auth/verify/request` in a loop and filling the database with junk attempts. A simple fix: check for existing pending attempts from the same email within the last N minutes and reject if found. For a personal site behind Google OAuth, this isn't urgent. For anything public-facing, it's table stakes.

**Code expiration.** Verification codes currently live forever. A production system would add a `expires_at` column and reject codes older than 10 minutes.

**Notification on new attempts.** When someone tries to sign in and hits the pending state, I don't know about it until I check the dashboard. A webhook to Discord or Slack would close that loop.

**The approval actually granting access.** Right now, an approved email lets you through the `signIn` callback — but only if you sign in with Google using that exact email. If someone verified via email code but uses a different Google account, the approval doesn't carry over. This is by design (the email-code flow proves ownership of an address, and the Google SSO proves ownership of a Google account with that address), but it's worth being explicit about.

---

If you're building something similar, the core insight is: **auth and authorization are two different problems, and the interesting UX lives in the gap between them.** Auth.js handles the "who are you?" question. The approval queue handles the "should you be here?" question. The verification code flow handles "prove it's really you." Most tutorials conflate all three. Separating them gives you a system where adding a new sign-in method doesn't require rewriting your access control — and where saying "no" to someone feels intentional, not broken.

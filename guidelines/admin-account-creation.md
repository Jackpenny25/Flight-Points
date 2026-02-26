# Admin Account Creation Feature — Implementation Prompt

## Overview

Add a new admin-driven account creation flow to the Signups tab. Instead of cadets self-registering via the signup form, the Flight Point Lead (snco) selects an existing cadet/staff member from the cadets table, and the system generates a username + secure password. The credentials are displayed once for the admin to hand to the user, and the account is immediately saved to `app_users` ready for login.

This feature lives **alongside** the existing self-signup flow (join code → pending request → approve). It does not replace it.

---

## Database Changes

### No new tables needed
The account is created directly in `app_users` (the existing auth table). The link to the cadets table is via the `name` column matching `cadets.name`.

### Migration: `migrations/20260226_add_created_by_admin.sql`
Add an optional column to `app_users` to mark admin-created accounts:

```sql
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cadet_id UUID REFERENCES cadets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_app_users_cadet_id ON app_users (cadet_id);
```

- `created_by`: stores the admin user's name/email who created the account.
- `cadet_id`: optional FK linking the account to a specific cadet record. This makes name sync easier and prevents duplicate accounts per cadet.

---

## Username Generation

Usernames should be **derived from the cadet's name** in a predictable, readable format:

1. Take the cadet's full name from the cadets table (e.g. "John Smith").
2. Convert to lowercase, strip special characters, replace spaces with dots: `john.smith`.
3. If a collision exists in `app_users`, append a number: `john.smith2`, `john.smith3`, etc.
4. For HQ/staff members who have a rank (e.g. "Fg Off", name "Jane Doe"), the username is still just the name: `jane.doe` (rank is NOT included in the username).
5. Username max length: 30 characters.
6. The generated username doubles as the user's `email` field in `app_users` (since the login system already supports username-based login via `api.lookupEmail`). Alternatively, store it as `{username}@flightpoints.local` to keep the email field valid — **decision: use `{username}@flightpoints.local`** so the email column stays consistent but the user logs in with just the username part.

---

## Password Generation

Generate a **secure, human-readable** password:

- Format: `Word-Word-Number` (e.g. `Eagle-Bravo-47`, `Delta-Storm-83`)
- Use a curated word list of ~100 simple, memorable words (aviation/military themed where possible: Alpha, Bravo, Charlie, Delta, Eagle, Falcon, Hawk, Sierra, Tango, Victor, etc.)
- The number is 2 digits (10–99).
- This gives roughly 100 × 100 × 90 = 900,000 combinations — sufficient for a local/squadron app.
- The password is displayed ONCE to the admin at creation time, then stored as a bcrypt hash.
- If the admin loses the password, they can use a "Reset Password" action to generate a new one.

---

## Server API Endpoints

### `POST /api/admin/create-account`

**Auth:** Requires `requireAuth` + `snco` role (use `hasSignupAdminRole`).

**Request body:**
```json
{
  "cadetId": "uuid-of-the-cadet",
  "role": "cadet"          // optional, defaults to "cadet"
}
```

**Server logic:**
1. Look up the cadet by ID in the `cadets` table. Return 404 if not found.
2. Check if an `app_users` record already exists with this `cadet_id`. If so, return 409 Conflict with a message like "This cadet already has an account" and include the existing username.
3. Generate the username from the cadet's name (see rules above).
4. Check for username collisions in `app_users` (by email pattern `{username}@flightpoints.local`).
5. Generate the password (Word-Word-Number format).
6. Hash the password with bcrypt (cost 10).
7. Insert into `app_users`:
   - `id`: `crypto.randomUUID()`
   - `email`: `{username}@flightpoints.local`
   - `name`: cadet's name (from cadets table)
   - `role`: from request body or default `cadet`
   - `password_hash`: bcrypt hash
   - `cadet_id`: the cadet's UUID
   - `created_by`: `req.user.name` or `req.user.email`
8. Return the **plaintext** credentials (this is the only time they are available):

**Response:**
```json
{
  "account": {
    "id": "new-user-uuid",
    "username": "john.smith",
    "password": "Eagle-Bravo-47",
    "name": "John Smith",
    "role": "cadet",
    "flight": "2"
  }
}
```

### `POST /api/admin/reset-account-password`

**Auth:** Requires `requireAuth` + `snco` role.

**Request body:**
```json
{
  "userId": "uuid-of-the-app-user"
}
```

**Server logic:**
1. Look up the user in `app_users`. Return 404 if not found.
2. Generate a new password (same Word-Word-Number format).
3. Hash and update `password_hash` in `app_users`.
4. Return the new plaintext password.

**Response:**
```json
{
  "username": "john.smith",
  "password": "Falcon-Delta-29"
}
```

---

## Frontend UI

### Location: AdminSignups.tsx (Signups tab)

Add a new Card section at the **top** of the Signups tab titled **"Create Account"**.

### UI Layout:

```
┌─────────────────────────────────────────────────┐
│ Create Account                                   │
│ Create a new account for a cadet or staff member │
│                                                  │
│  Select Cadet: [ Dropdown / Searchable Select ]  │
│  Role:         [ cadet ▾ ]                       │
│                                                  │
│  [Create Account]                                │
│                                                  │
│  ┌─ Credentials (shown after creation) ────────┐ │
│  │  Username: john.smith          [📋 Copy]    │ │
│  │  Password: Eagle-Bravo-47     [📋 Copy]    │ │
│  │                                              │ │
│  │  [📋 Copy Both]  [Print Slip]               │ │
│  │                                              │ │
│  │  ⚠ Save these credentials now — the         │ │
│  │    password cannot be viewed again.          │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Cadet Dropdown Behavior:
- Fetch cadets from `api.getCadets()`.
- Group by flight (Flight 1, 2, 3, 4, Staff/HQ Flight).
- Show flight label as group headers in the dropdown.
- Display each cadet as: `{name} — Flight {n}` (or `{rank} {name} — Staff / HQ` for HQ).
- Filter out cadets who **already have an account** (cross-reference with `api.getUsers()` by matching `cadet_id` or name).
- Show a searchable/filterable input (use existing Select component or add a simple text filter).

### Role Dropdown:
- Options: Cadet (default), Point Giver, Staff, Flight Point Lead.
- Values: `cadet`, `pointgiver`, `staff`, `snco`.
- Default to `cadet` for numbered flights, `staff` for HQ flight.

### After Account Creation:
- Show the credentials card with copy buttons.
- Toast notification: "Account created for {name}".
- The credentials card stays visible until the admin creates another account or navigates away.
- Refresh the "Existing Accounts" table below to include the new account.

### Copy Functionality:
- "Copy" buttons use `navigator.clipboard.writeText()`.
- "Copy Both" copies: `Username: john.smith\nPassword: Eagle-Bravo-47`.
- Show a brief toast: "Copied to clipboard".

### Print Slip (optional, nice-to-have):
- Opens a small print dialog with:
  ```
  Flight Points — Your Login Details
  ──────────────────────────────────
  Username: john.smith
  Password: Eagle-Bravo-47
  
  Log in at: flightpoints.uk
  Change your password after first login.
  ```

### Password Reset:
- In the "Existing Accounts" table, add a "Reset Password" button next to each user.
- On click, call `POST /api/admin/reset-account-password`.
- Show the new password in a modal/dialog with copy button.
- Same warning: "Save this password now — it cannot be viewed again."

---

## Login Flow Compatibility

The existing login already supports username-based login:
- In `Login.tsx`, if the input doesn't contain `@`, it calls `api.lookupEmail(username)` to resolve the email.
- The `POST /api/auth/lookup-email` endpoint needs to handle the `@flightpoints.local` suffix.

### Update the `lookup-email` endpoint:
Currently it should search `app_users` where `email = '{username}@flightpoints.local'` OR `LOWER(name) = LOWER(username)`.

Verify the existing lookup-email route handles this. If it searches by email prefix, it should work. If not, update it to:
```sql
SELECT email FROM app_users
WHERE LOWER(email) = LOWER($1 || '@flightpoints.local')
   OR LOWER(SPLIT_PART(email, '@', 1)) = LOWER($1)
LIMIT 1
```

---

## Security Considerations

- **Password visibility:** The plaintext password is only returned once in the API response. It is never stored or retrievable after creation.
- **HTTPS:** The app runs over HTTPS (flightpoints.uk), so credentials in transit are encrypted.
- **Rate limiting:** The create-account endpoint inherits `requireAuth` + role checks. No additional rate limiting needed since only admins can call it.
- **Brute force:** The login endpoint already has `authLimiter`. The generated passwords (900K+ combinations) are sufficient for a squadron-level app.
- **No email verification needed:** These are admin-provisioned accounts; the email is synthetic (`@flightpoints.local`).

---

## Word List for Password Generation (server-side)

Store this as a const array in `server/server.ts` (or a separate `server/wordlist.ts`):

```typescript
const PASSWORD_WORDS = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
  'Xray', 'Yankee', 'Zulu', 'Eagle', 'Falcon', 'Hawk', 'Storm', 'Thunder',
  'Phoenix', 'Viper', 'Cobra', 'Tiger', 'Mustang', 'Raptor', 'Shadow',
  'Arrow', 'Blaze', 'Comet', 'Dagger', 'Flare', 'Granite', 'Horizon',
  'Iron', 'Javelin', 'Knight', 'Lance', 'Meteor', 'Noble', 'Onyx',
  'Patriot', 'Quartz', 'Rocket', 'Sabre', 'Titan', 'Unity', 'Valor',
  'Warrior', 'Zenith', 'Bolt', 'Crest', 'Dawn', 'Ember', 'Frost',
  'Gale', 'Haven', 'Ivory', 'Jade', 'Kindle', 'Lunar', 'Marvel',
  'Nimbus', 'Orbit', 'Pulse', 'Ridge', 'Spark', 'Trail', 'Ultra',
  'Venture', 'Willow', 'Apex', 'Bridge', 'Canyon', 'Drift', 'Fleet',
  'Guard', 'Herald', 'Impact', 'Jetstream', 'Keystone', 'Legend', 'Mirage',
  'Nexus', 'Outpost', 'Pinnacle', 'Quest', 'Ranger', 'Sentinel', 'Trident',
];
```

Password generation function:
```typescript
function generatePassword(): string {
  const w1 = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  const w2 = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${w1}-${w2}-${num}`;
}
```

---

## Implementation Order

1. **Migration** — Add `created_by` and `cadet_id` columns to `app_users`.
2. **Server: password generation** — Add word list and `generatePassword()`.
3. **Server: username generation** — Add `generateUsername(name)` helper.
4. **Server: `POST /api/admin/create-account`** — Full endpoint.
5. **Server: `POST /api/admin/reset-account-password`** — Full endpoint.
6. **Server: update lookup-email** — Ensure username login works for `@flightpoints.local` accounts.
7. **Frontend: api.ts** — Add `createAccount` and `resetAccountPassword` methods.
8. **Frontend: AdminSignups.tsx** — Add the "Create Account" card with cadet selector, role picker, create button, and credentials display.
9. **Frontend: AdminSignups.tsx** — Add "Reset Password" button to existing accounts table.
10. **Test** — Create an account, verify login works, verify password reset works.

---

## Files to Modify

| File | Changes |
|---|---|
| `server/server.ts` | Add password word list, `generatePassword()`, `generateUsername()`, two new endpoints, update lookup-email |
| `src/utils/api.ts` | Add `createAccount()` and `resetAccountPassword()` methods |
| `src/app/components/AdminSignups.tsx` | Add "Create Account" card UI, credentials display, reset password button |
| `migrations/20260226_add_created_by_admin.sql` | New migration file |

---

## Edge Cases to Handle

- **Cadet already has an account:** Return 409 with the existing username. UI should show "This cadet already has an account (username: x)".
- **Duplicate names across flights:** Username collision handled by appending numbers.
- **Very long names:** Truncate username to 30 chars before the `@flightpoints.local` suffix.
- **Special characters in names:** Strip everything except letters, numbers, dots, hyphens.
- **Admin creates account for themselves:** Allowed (they might want a fresh password).
- **HQ/Staff role defaults:** When the selected cadet has `flight = 'hq'`, default role to `staff` instead of `cadet`.
- **Cadet deleted after account created:** The `cadet_id` FK has `ON DELETE SET NULL`, so the account survives but loses the link.

---

## What This Does NOT Change

- The self-signup flow (join code → pending → approve) remains available.
- The login page remains the same — cadets just type their username + password.
- Existing accounts are unaffected.
- The cadets table structure is unchanged.
- Points and attendance linking (by name) continues to work since the `app_users.name` matches `cadets.name`.

# Step 13 — Creating Users: Normal vs Admin

---

## What You Are Doing

Since the Cognito user pool has `selfSignUpEnabled: false`, every user must be created by an admin (via AWS CLI or Console) — there's no public sign-up form. This step covers creating both kinds of accounts the app cares about:

- **Normal user** — not in any Cognito group (or explicitly in the `user` group)
- **Admin user** — member of the `admin` group

> There is no separate "admin flag" field anywhere. `GET /auth/me` (Step 9) reads the access token's `cognito:groups` claim and sets `isAdmin`/`role` based solely on whether `"admin"` is present in that list:
>
> ```typescript
> const groups = (payload['cognito:groups'] as string[] | undefined) ?? [];
> const isAdmin = groups.includes('admin');
> ```
>
> So "making someone an admin" is entirely a group-membership operation in Cognito — there's nothing to change in application code.

---

## 13.1 Prerequisites

- AWS CLI configured with credentials that can manage this user pool (same profile used for `cdk deploy`).
- Your `USER_POOL_ID`, from `.env.local` (Step 13 of the main deployment notes) or the CDK output. Export it once per terminal session:
  ```bash
  export USER_POOL_ID=<your-user-pool-id>
  ```

---

## 13.2 Create a Normal User

```bash
# 1. Create the user with a temporary password. --message-action SUPPRESS skips
#    sending Cognito's default invitation email (useful for test accounts).
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username user@buildtrack.dev \
  --user-attributes Name=email,Value=user@buildtrack.dev Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

# 2. Set a permanent password so login doesn't hit the NEW_PASSWORD_REQUIRED
#    challenge (Step 6 surfaces that challenge as a 401 — it isn't implemented yet).
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username user@buildtrack.dev \
  --password RealPass123! \
  --permanent

# 3. Explicitly put them in the "user" group. Not strictly required — /auth/me
#    already treats "no admin group" as role: 'user' — but explicit membership
#    keeps every account auditable in one place (Cognito Console → Groups) instead
#    of relying on the absence of a group to imply intent.
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username user@buildtrack.dev \
  --group-name user
```

---

## 13.3 Create an Admin User

Identical to 13.2, except the last command targets the `admin` group instead:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin@buildtrack.dev \
  --user-attributes Name=email,Value=admin@buildtrack.dev Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin@buildtrack.dev \
  --password RealPass123! \
  --permanent

aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username admin@buildtrack.dev \
  --group-name admin
```

---

## 13.4 Verify Group Membership

```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id $USER_POOL_ID \
  --username admin@buildtrack.dev
```

Expected output includes a `Groups` array with `GroupName: "admin"` and `Precedence: 1`.

---

## 13.5 Console Alternative (No CLI)

1. AWS Console → **Cognito** → **User pools** → `buildtrack-users`.
2. **Users** tab → **Create user**.
   - Username/email: e.g. `admin@buildtrack.dev`
   - Mark email as verified.
   - Set a password directly (choose "Set a password" instead of "Generate a password" to skip the temporary-password flow entirely).
3. **Groups** tab → click into `admin` or `user` → **Add user to group** → select the user you just created.

---

## 13.6 Promote or Demote a User Later

```bash
# Promote a normal user to admin
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username user@buildtrack.dev \
  --group-name admin

# Demote an admin back to a normal user
aws cognito-idp admin-remove-user-from-group \
  --user-pool-id $USER_POOL_ID \
  --username admin@buildtrack.dev \
  --group-name admin
```

> A change here doesn't take effect until the user's **next login** or **token refresh** — `cognito:groups` is baked into the access token at issuance time (Steps 6/7), so an already-issued token keeps the old group membership until it's replaced.

---

## 13.7 Confirm With the Actual API

Using either Postman (Step 12) or curl (Step 11), log in as each user and hit `/auth/me`:

```bash
curl -s -X POST <API_URL or http://localhost:4000>/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@buildtrack.dev","password":"RealPass123!"}' | jq -r '.data.accessToken' \
  | xargs -I{} curl -s <API_URL or http://localhost:4000>/auth/me -H "Authorization: Bearer {}" | jq
```

Expect `"role": "admin", "isAdmin": true` for the admin account and `"role": "user", "isAdmin": false` for the normal account.

---

## Key Concepts (For Reference)

| Concept                                              | What It Means                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin-create-user`                                | The only way to create a user in this pool — mirrors`selfSignUpEnabled: false` from `lib/buildtrack-stack.ts`                                                                                                                                                                                                                                                            |
| `--message-action SUPPRESS`                        | Skips Cognito's default "you've been invited" email — useful for test/seed accounts, but you'd normally omit this in real onboarding so the user gets their temporary password                                                                                                                                                                                               |
| Temporary vs. permanent password                     | `admin-create-user` always sets a temporary password requiring `NEW_PASSWORD_REQUIRED` on first login; `admin-set-user-password --permanent` skips that, which is convenient for test users since that challenge isn't handled by `POST /auth/login` yet                                                                                                              |
| Group`admin` vs `user`                           | Plain Cognito groups created in the stack (`AdminGroup`, `UserGroup`) — membership is exactly what `/auth/me` reads to compute `role`/`isAdmin`, nothing else                                                                                                                                                                                                      |
| `Precedence: 1` vs `2`                           | Only matters if a single user is in*both* groups — Cognito's `cognito:groups` claim would then list both, but the lower-precedence number (`admin`, precedence 1) is meant to "win" in any logic that only checks the first group. This app's logic (`groups.includes('admin')`) doesn't depend on precedence at all — it just checks for admin membership directly |
| Group membership takes effect on next token issuance | Existing access/ID tokens are immutable once issued — changing group membership doesn't retroactively change a token already in someone's hand                                                                                                                                                                                                                               |

---

## Common Errors & Fixes

| Error                                                                      | Cause                                                                                                                                           | Fix                                                                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `UsernameExistsException`                                                | User already created previously                                                                                                                 | Either reuse the existing user, or`admin-delete-user` first if you want a clean slate       |
| `InvalidPasswordException`                                               | Password doesn't meet the pool's policy (`minLength: 8`, upper+lower+digit required, symbols optional — see `passwordPolicy` in the stack) | Choose a password meeting all four rules                                                      |
| `ResourceNotFoundException: Group not found`                             | Typo in`--group-name` (must be exactly `admin` or `user`, case-sensitive, matching `groupName` in the stack)                            | Re-check spelling/casing                                                                      |
| `/auth/me` shows `role: "user"` for a user you just added to `admin` | Tested with a token issued**before** the group change                                                                                     | Log in again (or call`/auth/refresh`) to get a token that reflects current group membership |

---

## Checkpoints

- [ ] At least one normal user created, permanent password set, in the `user` group
- [ ] At least one admin user created, permanent password set, in the `admin` group
- [ ] `admin-list-groups-for-user` confirms correct group membership for both
- [ ] `GET /auth/me` returns `role: "user"` / `isAdmin: false` for the normal user
- [ ] `GET /auth/me` returns `role: "admin"` / `isAdmin: true` for the admin user

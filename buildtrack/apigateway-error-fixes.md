# API Gateway Auth Error Fixes

Two separate issues surfaced while testing the `/projects` create API, fixed in sequence.

## Issue 1: SigV4 parsing error on `POST /projects`

**Symptom**

```
{
    "message": "Invalid key=value pair (missing equal-sign) in Authorization header (hashed with SHA-256 and encoded with Base64): 'MVJEbYrgIo1N9EWG7klJ7x33PpsIeK5Qa2QV7938gTs='."
}
```

Calls to `/projects/{id}` worked fine; only the bare `POST /projects` (create) failed.

**Root cause**

`addProtectedRoute` in `lib/buildtrack-stack.ts` only called `resource.addProxy(...)`, which
creates the `{proxy+}` sub-resource (handles `/projects/anything`). CDK's `ProxyResource` only
auto-propagates its `ANY` method to the *parent* resource when that parent is the API root
(`path === '/'`). Since `/projects` isn't the root, the exact base path had **no method defined
at all**.

When a request hits a resource/method combo with no matching method, API Gateway falls back to
trying to parse the `Authorization` header as an AWS SigV4 signature — producing the
"Invalid key=value pair... SHA-256" error when the header is actually a JWT.

**Fix** — `lib/buildtrack-stack.ts`

Explicitly add an `ANY` method on the base resource itself (same integration + authorizer),
in addition to the proxy:

```ts
const addProtectedRoute = (routePath: string, fn: lambda.IFunction) => {
  const resource = api.root.addResource(routePath);
  const integration = new apigateway.LambdaIntegration(fn, { allowTestInvoke: false });
  const methodOptions: apigateway.MethodOptions = { authorizer, authorizationType: ... };

  // NEW — base path (e.g. POST /projects) needs its own method
  resource.addMethod('ANY', integration, methodOptions);

  resource.addProxy({
    defaultIntegration: integration,
    defaultMethodOptions: methodOptions,
    anyMethod: true,
  });
};
```

**Verification**: `cdk diff` showed new `AWS::ApiGateway::Method` (`ANY`) + `AWS::Lambda::Permission`
resources on the base `/projects`, `/workers`, `/materials`, `/progress`, `/dashboard` resources —
purely additive, no replacements.

---

## Issue 2: `401 Unauthorized` when sending `Authorization: Bearer <token>`

**Symptom**

After the fix above, `POST /projects` reached the authorizer but was rejected with a plain
`401 Unauthorized` before the Lambda ever ran (confirmed because `requireAdmin` in
`services/projects-service/src/lib/admin.ts` returns `403`, never `401`, so the request didn't
even reach the Lambda).

**Root cause**

The route used API Gateway's **native** `CognitoUserPoolsAuthorizer`, whose `identitySource`
(`method.request.header.Authorization`) is parsed as a raw JWT with no scheme prefix. Sending
`Authorization: Bearer <token>` breaks that parsing, so the authorizer rejects it. This is
different from `/auth/me` (`services/auth-service/src/routes/me.ts`), which decodes the header in
app code and explicitly expects `Bearer `.

**Fix** — replaced the native Cognito authorizer with a Lambda-backed `TokenAuthorizer` that
accepts the conventional `Bearer`-prefixed format (and a bare token too), so the whole API is
consistent.

### New file: `services/auth-service/src/authorizer.ts`

- Strips an optional `Bearer ` prefix (case-insensitive).
- Verifies the token via `aws-jwt-verify`'s `CognitoJwtVerifier`, trying the **access token**
  first, falling back to the **ID token**.
- On success: returns an `Allow` IAM policy (wildcarded to the whole API stage, so the cached
  decision isn't scoped to just the one method that was called) plus a `context` object
  (`sub`, `email`, `groups` — `groups` as a flat comma-separated string, since API Gateway
  authorizer context values must be plain strings).
- On missing header or failed verification: throws `Error('Unauthorized')`, which API Gateway
  maps to `401` (same behavior as before).

### `lib/buildtrack-stack.ts`

- Added `authorizerFn` Lambda (`makeLambda('AuthorizerFn', 'services/auth-service/src/authorizer.ts')`).
- Replaced:
  ```ts
  new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', { cognitoUserPools: [userPool], ... })
  ```
  with:
  ```ts
  new apigateway.TokenAuthorizer(this, 'Authorizer', { handler: authorizerFn, ... })
  ```
- `addProtectedRoute`'s `methodOptions.authorizationType` changed from
  `AuthorizationType.COGNITO` → `AuthorizationType.CUSTOM`.

### `services/projects-service/src/lib/lambda-context.ts`

Native authorizer nested claims under `requestContext.authorizer.claims`. A custom Lambda
authorizer's `context` fields land flat under `requestContext.authorizer` directly, so the type
changed from:

```ts
export interface AuthorizerClaims { sub: string; email?: string; 'cognito:groups'?: string; }
export interface LambdaProxyEvent {
  requestContext: { authorizer?: { claims?: AuthorizerClaims } };
}
```

to:

```ts
export interface AuthorizerContext { sub: string; email?: string; groups?: string; }
export interface LambdaProxyEvent {
  requestContext: { authorizer?: AuthorizerContext };
}
```

### `services/projects-service/src/lib/admin.ts`

`requireAdmin` updated to read `requestContext.authorizer.groups` directly instead of
`requestContext.authorizer.claims['cognito:groups']`. This also removed a since-obsolete
workaround that stripped `[...]` brackets — that bracket format was a native-authorizer-specific
serialization quirk that no longer applies now that `authorizer.ts` controls the format and emits
a plain comma-separated string.

### `services/projects-service/src/local.ts`

Dev-mode mock (`buildFakeEvent`) updated to build the same flat `requestContext.authorizer`
shape, and to strip `Bearer ` the same way the real authorizer does, so local behavior matches
production.

**Verification**:
- `npm run build` (root, `auth-service`, `projects-service`) — all type-check clean.
- `cdk synth` — succeeds; confirmed `AuthorizerFn` Lambda, its Lambda permission, and the
  `AWS::ApiGateway::Authorizer` (type `TOKEN`) are present.
- `cdk diff` — shows all 10 protected methods' `AuthorizationType` changing
  `COGNITO_USER_POOLS` → `CUSTOM`, and the `Authorizer` resource switching from Cognito-native to
  the new Lambda, with no destructive replacements.

---

## Net result

`/projects` (and all other protected routes) now accept either:
- `Authorization: Bearer <token>`, or
- `Authorization: <token>` (no scheme)

using either the Cognito **access token** or **ID token**. Deploy with `npm run deploy` (or
`deploy:dev` / `deploy:prod`) to apply — not yet deployed as of this writeup.

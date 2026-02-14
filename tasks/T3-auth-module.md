# T3 — OBO Auth Module

## Goal

Create the On-Behalf-Of (OBO) token exchange module that converts a Teams SSO token into a delegated user token scoped to the RAG service. After this task, `getDelegatedToken(ssoToken, userId)` returns a cached or freshly-acquired delegated token.

## Prerequisites

- **T1** completed (extension scaffold exists).

## Background: Why OBO?

The RAG service enforces SharePoint security trimming — it only returns documents the requesting user has access to. To do this, the RAG service needs a **delegated** Azure AD token that represents the specific user, not the bot application. The OBO flow exchanges the bot's SSO token (received from Teams) for a delegated token with the correct audience (the RAG service's app registration).

Flow: `Teams SSO token (user identity) → Azure AD OBO endpoint → Delegated token (audience: RAG service)`

## File to Create

### `extensions/rag-internal/src/auth.ts`

```typescript
import { createSubsystemLogger } from "openclaw/plugin-sdk";

const logger = createSubsystemLogger("rag-internal:auth");

// === Types ===

type CachedToken = {
  token: string;
  expiresAt: number;   // ms since epoch
  acquiredAt: number;   // ms since epoch
};

export class OboTokenError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`OBO token exchange failed: ${status}`);
    this.name = "OboTokenError";
  }
}

// === State ===

// In-memory cache: userId → CachedToken
// Tokens are per-user because OBO produces a delegated token for each user.
const tokenCache = new Map<string, CachedToken>();

// === Environment ===

// These are set in the .env file and resolved by OpenClaw's env-substitution.
// AAD_CLIENT_ID and AAD_CLIENT_SECRET are for the bot's app registration.
// RAG_SERVICE_SCOPE is the target audience for the delegated token.
const AAD_CLIENT_ID = process.env.AAD_CLIENT_ID!;
const AAD_CLIENT_SECRET = process.env.AAD_CLIENT_SECRET!;
const AAD_TENANT_ID = process.env.AAD_TENANT_ID!;
const RAG_SERVICE_SCOPE = process.env.RAG_SERVICE_SCOPE!; // e.g., "api://<rag-app-id>/.default"
const TOKEN_URL = `https://login.microsoftonline.com/${AAD_TENANT_ID}/oauth2/v2.0/token`;

// Cache buffer: refresh tokens that will expire within this window
const CACHE_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// === Public API ===

/**
 * Get a delegated user token for the RAG service via OBO flow.
 *
 * Returns a cached token if still valid (>5 min before expiry).
 * Otherwise, performs the OBO exchange with Azure AD.
 *
 * @param userSsoToken - The SSO token from the Teams Activity (user identity)
 * @param userId - Azure AD Object ID of the user (for cache key)
 * @returns Delegated access token string
 * @throws OboTokenError if the exchange fails
 */
export async function getDelegatedToken(
  userSsoToken: string,
  userId: string,
): Promise<string> {
  // 1. Check cache
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt - Date.now() > CACHE_BUFFER_MS) {
    return cached.token;
  }

  // 2. OBO token exchange
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    client_id: AAD_CLIENT_ID,
    client_secret: AAD_CLIENT_SECRET,
    assertion: userSsoToken,
    scope: RAG_SERVICE_SCOPE,
    requested_token_use: "on_behalf_of",
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("OBO token exchange failed", {
      userId,
      status: response.status,
    });
    throw new OboTokenError(response.status, error);
  }

  const data = await response.json();
  const token: string = data.access_token;
  const expiresIn: number = data.expires_in; // seconds

  // 3. Cache the token
  tokenCache.set(userId, {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
    acquiredAt: Date.now(),
  });

  logger.info("OBO token acquired", {
    userId,
    expiresInSeconds: expiresIn,
  });

  return token;
}

/**
 * Clear cached token for a user.
 * Call this when the RAG service returns 401 — forces re-acquisition on next call.
 */
export function clearTokenCache(userId: string): void {
  tokenCache.delete(userId);
  logger.info("Token cache cleared", { userId });
}

/**
 * Get the acquisition timestamp of a cached token (for audit logging).
 * Returns undefined if no cached token exists.
 */
export function getTokenAcquiredAt(userId: string): number | undefined {
  return tokenCache.get(userId)?.acquiredAt;
}
```

## Key Design Decisions

### Why raw `fetch` instead of `@azure/msal-node`?

Simplicity. The OBO flow is a single POST request. MSAL adds ~2MB of dependencies for token caching and retry that we handle ourselves. If the team later prefers MSAL:

```bash
# Optional: switch to MSAL
pnpm add @azure/msal-node --filter @openclaw/rag-internal
```

Then replace the HTTP call with:
```typescript
import { ConfidentialClientApplication } from "@azure/msal-node";
const cca = new ConfidentialClientApplication({ auth: { clientId, clientSecret, authority } });
const result = await cca.acquireTokenOnBehalfOf({ oboAssertion: ssoToken, scopes: [scope] });
```

### Why in-memory cache?

- MVP is single-instance (no HA) — Map is sufficient.
- Tokens are short-lived (~60 min) and per-user — no persistence needed.
- Container restart clears cache — users just re-auth on next message (seamless via SSO).

### SSRF Consideration

This module calls `login.microsoftonline.com` directly via `fetch()` (not via `fetchWithSsrFGuard()`). This is intentional — the Azure AD token endpoint is a well-known Microsoft service, and the SSRF guard's hostname allowlist should include it at the container/network level. However, if stricter enforcement is needed, wrap this call with `fetchWithSsrFGuard()` and add `login.microsoftonline.com` to the SSRF allowlist.

### How the SSO token reaches this module

The SSO token comes from the Teams Activity. The msteams extension must handle the `tokenExchange` invoke to acquire it. This is **Open Question OQ-1** in `docs/12-open-questions.md`. The proposed default: implement `tokenExchange` invoke handling in the msteams extension. If the token is present in the Activity, use it directly. If not, trigger an OAuth card flow.

**For this task, assume the SSO token is available as a string passed from the msteams extension through the session context.** The exact wiring (how the token gets from the msteams extension to the rag_search tool handler) is handled in T4.

## Environment Variables Required

| Variable | Example | Description |
|----------|---------|-------------|
| `AAD_CLIENT_ID` | `12345678-abcd-...` | Bot's Azure AD app registration client ID |
| `AAD_CLIENT_SECRET` | `secret~...` | Bot's Azure AD app registration client secret |
| `AAD_TENANT_ID` | `abcdef01-2345-...` | Azure AD tenant ID |
| `RAG_SERVICE_SCOPE` | `api://rag-app-id/.default` | Target scope for the delegated token |

## SSRF / Network Egress Note

`login.microsoftonline.com` must be reachable from the container. Add it to:
1. Container network policy egress allowlist.
2. Optionally, the SSRF `hostnameAllowlist` in the config if using `fetchWithSsrFGuard()`.

## Verification

1. `getDelegatedToken(ssoToken, userId)` makes a POST to Azure AD's token endpoint with the correct OBO grant type.
2. Successful responses are cached per-user. A second call with the same userId returns the cached token without hitting Azure AD.
3. Cached tokens within 5 minutes of expiry are refreshed.
4. `clearTokenCache(userId)` removes the cached token, forcing re-acquisition.
5. `OboTokenError` is thrown with status and detail on failure.
6. No secrets (tokens, client_secret) are logged — only userId and status.

## What This Does NOT Include

- Wiring the SSO token from the msteams extension to the tool handler (T4)
- The `rag_search` tool handler that calls this (T4)
- The `tokenExchange` invoke handler in the msteams extension (Open Question OQ-1 — may need a separate task once resolved)

## Estimated Scope

1 file, ~100 lines of code.

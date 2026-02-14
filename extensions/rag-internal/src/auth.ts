import type { SsrFPolicy } from "../../../src/infra/net/ssrf.js";
import { fetchWithSsrFGuard } from "../../../src/infra/net/fetch-guard.js";
import { createSubsystemLogger } from "../../../src/logging/subsystem.js";

const logger = createSubsystemLogger("rag-internal:auth");

type CachedToken = {
  token: string;
  expiresAt: number;
  acquiredAt: number;
};

const tokenCache = new Map<string, CachedToken>();

const AAD_CLIENT_ID = process.env.AAD_CLIENT_ID ?? "";
const AAD_CLIENT_SECRET = process.env.AAD_CLIENT_SECRET ?? "";
const AAD_TENANT_ID = process.env.AAD_TENANT_ID ?? "";
const RAG_SERVICE_SCOPE = process.env.RAG_SERVICE_SCOPE ?? "";
const AAD_HOSTNAME = "login.microsoftonline.com";

const AAD_SSRF_POLICY: SsrFPolicy = {
  allowPrivateNetwork: false,
  hostnameAllowlist: [AAD_HOSTNAME],
};

function tokenUrl(): string {
  if (!AAD_TENANT_ID) {
    throw new Error("Missing required env var AAD_TENANT_ID");
  }
  return `https://${AAD_HOSTNAME}/${AAD_TENANT_ID}/oauth2/v2.0/token`;
}

function assertAuthEnv(): void {
  if (!AAD_CLIENT_ID || !AAD_CLIENT_SECRET || !RAG_SERVICE_SCOPE) {
    throw new Error(
      "Missing required auth env vars: AAD_CLIENT_ID, AAD_CLIENT_SECRET, RAG_SERVICE_SCOPE",
    );
  }
}

export async function getDelegatedToken(userSsoToken: string, userId: string): Promise<string> {
  assertAuthEnv();

  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) {
    return cached.token;
  }

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    client_id: AAD_CLIENT_ID,
    client_secret: AAD_CLIENT_SECRET,
    assertion: userSsoToken,
    scope: RAG_SERVICE_SCOPE,
    requested_token_use: "on_behalf_of",
  });

  const { response, release } = await fetchWithSsrFGuard({
    url: tokenUrl(),
    policy: AAD_SSRF_POLICY,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    timeoutMs: 10_000,
    auditContext: "rag-internal:obo",
  });

  try {
    if (!response.ok) {
      const detail = await response.text();
      logger.error("OBO token exchange failed", { userId, status: response.status });
      throw new OboTokenError(response.status, detail);
    }

    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    const token = data.access_token;
    const expiresIn = data.expires_in;
    if (!token || !expiresIn || !Number.isFinite(expiresIn)) {
      throw new OboTokenError(response.status, "Invalid token response payload");
    }

    const now = Date.now();
    tokenCache.set(userId, {
      token,
      expiresAt: now + expiresIn * 1000,
      acquiredAt: now,
    });

    return token;
  } finally {
    await release();
  }
}

export function clearTokenCache(userId: string): void {
  tokenCache.delete(userId);
}

export function readCachedTokenAgeSeconds(userId: string): number | undefined {
  const cached = tokenCache.get(userId);
  if (!cached) {
    return undefined;
  }
  return Math.floor((Date.now() - cached.acquiredAt) / 1000);
}

export class OboTokenError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`OBO token exchange failed: ${status}`);
    this.name = "OboTokenError";
  }
}

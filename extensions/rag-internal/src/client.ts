import { sleep } from "openclaw/plugin-sdk";
import type { SsrFPolicy } from "../../../src/infra/net/ssrf.js";
import type { RagSearchRequest, RagSearchResponse } from "./types.js";
import { fetchWithSsrFGuard } from "../../../src/infra/net/fetch-guard.js";

const RETRYABLE_STATUSES = new Set([429]);
const RAG_TIMEOUT_MS = 10_000;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function ragSsrFPolicy(): SsrFPolicy {
  return {
    allowPrivateNetwork: false,
    hostnameAllowlist: [requireEnv("RAG_ENDPOINT_HOST")],
  };
}

export async function searchRag(
  request: RagSearchRequest,
  delegatedToken: string,
): Promise<RagSearchResponse> {
  const url = requireEnv("RAG_ENDPOINT_URL");
  const policy = ragSsrFPolicy();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { response, release } = await fetchWithSsrFGuard({
      url,
      policy,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${delegatedToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
      timeoutMs: RAG_TIMEOUT_MS,
      auditContext: "rag-internal:search",
    });

    try {
      if (response.status === 401) {
        throw new RagHttpError(response.status, await response.text());
      }
      if (RETRYABLE_STATUSES.has(response.status) && attempt < 2) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        throw new RagHttpError(response.status, await response.text());
      }

      return (await response.json()) as RagSearchResponse;
    } finally {
      await release();
    }
  }

  throw new Error("RAG request exhausted retries");
}

export class RagHttpError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`RAG request failed: ${status}`);
    this.name = "RagHttpError";
  }
}

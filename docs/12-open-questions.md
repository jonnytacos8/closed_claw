# 12 — Open Questions

## Implementation Note

Items marked "Blocking for MVP" must be resolved before a coding agent can complete the corresponding deliverable. The "Proposed default" for each item tells the coding agent what to assume if no decision arrives in time. Each question references the doc and code path it affects.

## Summary

Decisions and details that must be confirmed before or during implementation. Each item includes context on why it matters and a proposed default if no decision is made.

---

## Identity & Auth

### OQ-1: Teams SSO Token Flow — Exact Mechanism

**Question:** Does the Teams bot receive a usable SSO token in the Bot Framework Activity, or do we need to trigger a `tokenExchange` invoke / OAuth card flow to acquire it?

**Why it matters:** This determines whether identity passthrough is seamless or requires a user-facing consent step on first interaction. If consent is needed, we must design the first-use flow.

**Proposed default:** Implement `tokenExchange` invoke handling in the `msteams` extension. If the token is present in the Activity, use it directly. If not, trigger an OAuth card. Test with the actual Teams bot registration to confirm behavior.

**Owner:** Platform team + Azure AD admin

---

### OQ-2: On-Behalf-Of (OBO) App Registration

**Question:** Is there an existing app registration we can use for the OBO token exchange (bot → delegated user token for RAG), or do we need to create one? What API permissions does the RAG service require on the delegated token?

**Why it matters:** OBO requires a confidential client app registration with specific API permissions. The RAG service must declare what scopes it needs (e.g., `user_impersonation`, custom scope).

**Proposed default:** Create a new app registration dedicated to the OpenClaw bot with the minimum scopes required by the RAG service. Do not reuse an existing app with broader permissions.

**Owner:** Azure AD admin + RAG team

---

### OQ-3: Token Caching and Refresh Strategy

**Question:** What is the token lifetime for delegated tokens from our Azure AD tenant? Is continuous access evaluation (CAE) enabled, and does it affect our caching strategy?

**Why it matters:** If tokens expire quickly (e.g., 60 minutes), we need aggressive refresh logic. If CAE is enabled, tokens may be revoked mid-session.

**Proposed default:** Cache tokens per-user per-session with TTL = `token.exp - 5 minutes`. On 401 from RAG, clear cache and re-acquire.

**Owner:** Azure AD admin

---

## RAG Service

### OQ-4: RAG API Contract Confirmation

**Question:** Does the internal RAG service already expose the API described in `docs/06-rag-contract.md`, or does it expose a different interface? What are the actual endpoint paths, request/response schemas, and authentication requirements?

**Why it matters:** The RAG contract in doc 06 is a proposed contract. If the RAG service has a different API, OpenClaw's integration code must adapt.

**Proposed default:** Use the contract in doc 06 as the target. If the RAG service differs, build a thin adapter layer in OpenClaw (a skill or middleware) that translates between our expected format and the RAG service's actual format.

**Owner:** RAG team + Platform team

---

### OQ-5: Excel File Chunking Quality

**Question:** How well does the RAG service handle Excel files? Specifically: does it preserve table structure (headers, cell references), handle merged cells, extract from named ranges/tables, and handle multi-sheet workbooks?

**Why it matters:** Excel is the primary use case. If RAG chunks lose table structure, the model will receive garbled data and produce poor results. This is the single biggest technical risk to the MVP.

**Proposed default:** Conduct a test with 10 representative finance Excel files. Evaluate chunk quality. If poor, explore: (a) improving the RAG indexer's Excel pipeline, or (b) having OpenClaw directly fetch the file via SharePoint API and extract tables itself (adds complexity and a new egress destination).

**Owner:** RAG team + Platform team

---

### OQ-6: SharePoint Library Onboarding

**Question:** What is the process to register a new SharePoint document library with the RAG service? How long does initial indexing take? Is there a self-service portal or is it admin-only?

**Why it matters:** Pilot users need their working libraries indexed before they can use the bot. If onboarding is slow or manual, it becomes a bottleneck.

**Proposed default:** Admin-only for MVP. Prepare a list of target libraries before pilot start (week 0). Allow 48 hours for initial indexing.

**Owner:** RAG team

---

### OQ-7: RAG Security Trimming Validation

**Question:** How do we validate that security trimming is working correctly? Is there a test mode or audit log that shows "user X queried for doc Y, access was [granted/denied]"?

**Why it matters:** Security trimming is a non-negotiable. We need to be able to prove it works before going live with the pilot.

**Proposed default:** Create two test users — one with access to a specific library, one without. Run identical queries. Verify that the restricted user receives zero results from that library. Document the test and results.

**Owner:** RAG team + Security team

---

## Azure Model Endpoint

### OQ-8: Azure Deployment Details

**Question:** What model is deployed (GPT-4, GPT-4o, GPT-4-turbo)? What is the context window? What is the token-per-minute (TPM) quota? Is the deployment in our region?

**Why it matters:** Model selection affects response quality, latency, and cost. TPM quota determines concurrent user capacity. Region affects latency.

**Proposed default:** Assume GPT-4o with 128k context, regional deployment. Request TPM quota sufficient for 30 concurrent pilot users (~100k TPM based on ~3,000 tokens/request at 2 requests/user/hour peak).

**Owner:** Azure/Cloud team

---

### OQ-9: API Version and Auth Mechanism

**Question:** Which Azure OpenAI API version should we target? Does the endpoint use API key auth or managed identity?

**Why it matters:** OpenClaw's provider config needs the correct API version string and auth mechanism. API key is simpler; managed identity is more secure but requires the container to have an Azure identity.

**Proposed default:** API key auth with `api-version=2024-10-21`. Store key in environment variable. Evaluate managed identity for post-MVP hardening.

**Owner:** Azure/Cloud team

---

### OQ-10: Content Filtering Configuration

**Question:** Is Azure's built-in content filtering enabled on the deployment? What categories are filtered? Can we customize the filter thresholds?

**Why it matters:** Aggressive content filtering may block legitimate financial analysis (e.g., discussions of fraud, loss, risk). We need to ensure the filter doesn't create false positives for common finance language.

**Proposed default:** Enable content filtering at default settings. Monitor `content_filter_triggered` events during pilot. Request threshold adjustments if false positive rate exceeds 2%.

**Owner:** Azure/Cloud team

---

## Teams Bot

### OQ-11: Bot Registration and Deployment Scope

**Question:** Is the Teams bot registered as a single-tenant or multi-tenant app? Is it deployed via Teams Admin Center (organization-wide) or sideloaded for the pilot?

**Why it matters:** Single-tenant is simpler and more secure for internal use. Sideloading is faster for pilot but requires per-user or per-team installation.

**Proposed default:** Single-tenant app registration. Sideloaded for pilot (Teams Admin Center can push it to the pilot group). Organization-wide deployment for post-pilot scale.

**Owner:** Teams admin + Platform team

---

### OQ-12: Bot Service Endpoint Hosting

**Question:** Where does the Bot Framework webhook (`/api/messages`) need to be reachable from? Does Bot Framework Service need to reach it over the public internet, or can we use a private endpoint / Azure Bot Service Direct Line?

**Why it matters:** If the webhook must be publicly accessible, we need to expose port 3978 through a reverse proxy with TLS. If we can use Direct Line or a private endpoint, we avoid public exposure.

**Proposed default:** Assume Bot Framework Service needs public HTTPS access to the webhook endpoint. Deploy behind a reverse proxy (e.g., Azure Application Gateway or nginx) with TLS termination and IP allowlisting for Bot Framework source IPs.

**Owner:** Platform team + Network team

---

## Operational

### OQ-13: Log Backend Selection

**Question:** What log ingestion and querying system should we use? Options: Azure Monitor / Log Analytics, Splunk, ELK, Datadog, or simple file-based logging with a custom dashboard.

**Why it matters:** Determines how we build dashboards and alerts (doc 10). OpenClaw supports structured JSON logging and has an optional OpenTelemetry extension.

**Proposed default:** If the organization has an existing log platform (Splunk, Azure Monitor), use it. If not, start with JSON file logging (`/opt/openclaw/logs/traces.jsonl`) and build dashboards post-pilot when volume justifies infrastructure.

**Owner:** Platform team + Ops team

---

### OQ-14: Container Hosting Environment

**Question:** Where do we run the OpenClaw Docker container? Options: Azure Container Instances (ACI), Azure Kubernetes Service (AKS), an internal VM, or an existing container platform.

**Why it matters:** Affects network policy enforcement, scaling, monitoring integration, and deployment automation.

**Proposed default:** ACI for MVP (single container, simple deployment, supports network restrictions). Evaluate AKS if we need multi-container scaling post-MVP.

**Owner:** Platform team

---

### OQ-15: Disaster Recovery and HA

**Question:** Does the MVP need high availability (multiple container instances), or is single-instance acceptable for a 30-user pilot?

**Why it matters:** HA adds complexity (session persistence across instances, load balancing). For a pilot, downtime is inconvenient but not catastrophic.

**Proposed default:** Single instance for MVP. Accept that container restarts or maintenance windows cause brief downtime. Document the restart procedure. Evaluate HA for post-pilot scaling.

**Owner:** Platform team

---

## Data & Compliance

### OQ-16: Data Residency Requirements

**Question:** Are there data residency requirements for the model prompts and responses? Must they stay in a specific Azure region?

**Why it matters:** If data residency is required, the Azure OpenAI deployment and the OpenClaw container must be in the correct region.

**Proposed default:** Deploy everything in the same region as the SharePoint tenant and existing Azure infrastructure. Document the region in the deployment config.

**Owner:** Compliance team

---

### OQ-17: Retention Policy for Session State

**Question:** How long should OpenClaw retain conversation session state (the multi-turn conversation context stored in `/opt/openclaw/sessions/`)? This is not log data — it's the actual conversation content.

**Why it matters:** Session state contains user messages and assistant responses (which contain document-derived content). Retaining it indefinitely creates data liability. Purging it too aggressively breaks multi-turn conversations.

**Proposed default:** Retain session state for 7 days after last activity. Auto-purge after that. Users can start a new conversation at any time.

**Owner:** Compliance team + Platform team

---

### OQ-18: DLP Label Enforcement Timeline

**Question:** When (if ever) should we enforce DLP labels — i.e., block responses that include content from documents with specific sensitivity labels (e.g., "Highly Confidential")?

**Why it matters:** MVP logs DLP labels but doesn't block. If compliance requires blocking, we need to implement filtering logic in OpenClaw's response pipeline.

**Proposed default:** Log-only for MVP. Review DLP label distribution in pilot data at week 4. If >5% of responses involve "Highly Confidential" content, evaluate blocking for Phase 2.

**Owner:** Compliance team + Security team

---

## Priority Matrix

| Question | Blocking for MVP? | Must Decide By |
|----------|-------------------|----------------|
| OQ-1: Teams SSO flow | Yes | Before implementation starts |
| OQ-2: OBO app registration | Yes | Before implementation starts |
| OQ-3: Token caching | No (use proposed default) | Week 1 |
| OQ-4: RAG API contract | Yes | Before implementation starts |
| OQ-5: Excel chunking quality | Yes | Week 0 (testing) |
| OQ-6: Library onboarding | Yes | Week 0 |
| OQ-7: Security trimming validation | Yes | Before pilot launch |
| OQ-8: Azure deployment details | Yes | Before implementation starts |
| OQ-9: API version and auth | Yes | Before implementation starts |
| OQ-10: Content filtering | No (use defaults) | Week 2 |
| OQ-11: Bot registration | Yes | Before implementation starts |
| OQ-12: Bot endpoint hosting | Yes | Before implementation starts |
| OQ-13: Log backend | No (use proposed default) | Week 1 |
| OQ-14: Container hosting | Yes | Before deployment |
| OQ-15: HA requirements | No (single instance) | Post-pilot |
| OQ-16: Data residency | Yes | Before deployment |
| OQ-17: Session retention | No (use proposed default) | Week 2 |
| OQ-18: DLP enforcement | No | Post-pilot |

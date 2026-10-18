# Repository audit

Audit dates: 17–18 October 2026. Scope: the supplied source repository, local build and API behavior, dependency metadata, and the configured DGX connection. This is a source and local runtime audit; it does not establish the state of a deployed website, Search Console account, publisher contracts, or a provisioned production database.

## Assessment

The supplied application was a prototype that presented generated and fallback material as news. Its most serious problems were unrestricted editorial writes, fabricated news generation, inconsistent storage, and article pages that depended on browser JavaScript for their content and metadata. Adding SEO keywords or an AI crawler file would not have corrected those problems.

The remediation separates ingestion from publication, introduces authenticated editorial operations, and makes published news available to crawlers in HTML and feeds. The production architecture uses Vercel for the website/API, MongoDB Atlas as the shared durable store, and a separate DGX worker for queued inference and optional scheduled ingestion. SQLite remains an optional local development store. Imported and AI-assisted material must pass editorial review before publication.

## Findings and remediation

| Priority | Supplied behavior and consequence | Remediation and remaining responsibility |
| --- | --- | --- |
| Critical | `server.ts` commented out its authentication import while exposing create, update, delete and AI operations. Anyone reaching the server could change the publication or consume inference resources. | Server operations require a service credential or a verified Firebase user with an explicit editor/admin claim. A separate ingestion credential can create drafts but cannot publish, update, export or delete. Provision credentials and claims outside source control. |
| Critical | Startup and a daily timer requested 100–150 invented snippets, including current-looking facts, scores and dates. Mock material and fixed briefing text were also returned on failure. | Automatic synthetic publication and production mock fallbacks are removed. Empty data remains empty, unavailable services report errors, RSS creates drafts, and analysis uses supplied source material. Editorial verification remains necessary. |
| High | Firestore rules and direct client access did not form a safe editorial boundary; the server also used the Firebase browser SDK. | Editorial publication moves behind the authenticated server API. Firestore is not the authoritative news store. Review the deployed Firebase rules separately, because changing this repository does not deploy them. |
| High | PostgreSQL and Firestore were used as overlapping stores, with different list/detail/sitemap paths and silent fallback. Some declared relational tables were not connected to the actual publication workflow. | MongoDB Atlas is the shared production authority for Vercel and the DGX worker; SQLite is an optional local store. Existing PostgreSQL/Firestore content requires an explicit export, review and draft import; it is not silently migrated. A serverless filesystem is not a production database. |
| High | News HTML was an empty root followed by client JavaScript; article titles and structured data were installed only after rendering. Social crawlers could receive the generic homepage metadata. | Published article HTML, metadata and structured data are served by the application, with real missing-page responses and publication-aware discovery. Validate the deployed HTML and rich results after configuring the production origin. |
| High | News sources and citation dates could be replaced by invented analysis. Credibility/importance scores and decorative images suggested verification that had not happened. | Store source links, source timestamps, AI provenance and review information; do not ask the model to invent verification or source authority. Only use article images with recorded rights and relevance. Publisher/source authorization is still an operational decision. |
| High | Draft, review and publication were not distinct states; changing an article could refresh its apparent publication time. | Draft/published/archived states and review validation are enforced on the server. First publication time and source time are separate; updates retain identity. Editorial review quality is not guaranteed by a timestamp. |
| High | RSS URLs were hardcoded, including plain HTTP, and automatically fetched by every web process. Deduplication was in memory, so restarting or scaling could repeat work. | Feed configuration is explicit, HTTPS, bounded and empty by default. Canonical source URL uniqueness is durable. Scheduled ingestion belongs on the explicitly configured DGX worker, not in a Vercel request or process timer. |
| High | HTML and large request bodies were accepted without a consistent validation boundary. | Article input is bounded, normalized and sanitized on the server; schema validation rejects unsupported state and unsafe URL schemes. Source text remains untrusted material when sent to a model. |
| Medium | Sitemap generation depended on Firestore alone and hardcoded the origin. It could omit readable articles or fail while the homepage remained healthy. | Discovery is based on the authoritative published store and configured site origin. Check the production sitemap and news sitemap after launch. |
| Medium | Unknown pages and missing articles were served through the SPA fallback, leading to soft 404s and misleading indexability. | Public article lookups and missing pages receive appropriate response status and crawler controls. Verify behavior through the actual CDN/reverse proxy. |
| Medium | No RSS output existed for republishing or consuming this publication's own news. | A published-news feed supports downstream readers. It does not grant permission to republish third-party source material. |
| Medium | README instructed setting `.env.local`, but the server did not load that file. Production detection used port/argv while mock seeding checked only `NODE_ENV`. | Environment loading and configuration are documented consistently. The container explicitly sets `NODE_ENV=production` and stores data outside its writable layer. |
| Medium | No versioned deployment, CI, test suite or supported Node version was supplied. | Node 22 container and CI definitions run installation, type checks, tests, build and production dependency audit. The production web entry uses Vercel Functions; the DGX worker runs separately. Account provisioning, container validation and CI completion must be recorded separately from source checks. |
| Medium | Dependency choices included unused native SQLite alongside unused PostgreSQL infrastructure, duplicate animation libraries, build tooling in runtime dependencies and a very large client bundle. | Remove unused dependencies and audit the final lockfile. Continue measuring the production bundle and page experience; deleting packages alone does not establish good performance. |
| Medium | Health returned an unconditional `ok`, and background work had little operational visibility. | Health and ingestion state are available for operational checks. External monitoring, disk alerts, inference availability checks and restore drills still need to be configured. |
| Medium | Browser editor screens did not prove authorization and treated arbitrary signed-in users as writers. | Editorial controls use explicit roles and authenticated API calls, including a draft review queue. Anonymous Firebase login and browser-side Firestore writes are removed. Keep service credentials on trusted servers; do not put them into browser-visible variables. |
| Medium | Article category links, filtering and saved content depended on inconsistent identifiers and client-only state. | Reader routes use consistent article IDs and explicit error/empty states. Bookmarks and preferences now remain in browser local storage. They are conveniences, not a durable multi-user editorial system. |
| Medium | Reader pages displayed fabricated market values, a false 1924 history and unsupported exclusive/popular/editor-picked labels. Public page loads could trigger paid model work. | Those claims, market fallbacks and visitor-triggered analysis are removed. The homepage presents deduplicated latest-first published news; editorial analysis is explicit and authenticated. |
| Low | Generic AI Studio naming and setup text, missing publisher policies and a 6250×6250 logo obscured the publication's identity and increased asset cost. | About and editorial-policy pages state the source/review/AI/corrections process. The owner must still supply real publisher and contact details and measure/optimize image delivery. |

## SEO, GEO and AIO

GEO and AIO are used here to mean making useful, attributable material accessible to search and generative answer systems. They are not ranking scores. Google's guidance says ordinary search fundamentals continue to apply to AI features and that no special AI file or schema is required. The practical work is indexable textual content, crawlable internal links, consistent structured data, clear sources and a useful reader experience. See [Google's AI features guidance](https://developers.google.com/search/docs/appearance/ai-features).

Article markup should describe the same headline, author, dates and images that a reader sees. Review the deployed output with [Google's Article structured-data guidance](https://developers.google.com/search/docs/appearance/structured-data/article). Neither valid markup nor a sitemap guarantees indexing or rich results.

The next editorial gains are more valuable than additional meta tags:

1. Publish original reporting or substantial, attributable analysis of authorized source material.
2. Identify the responsible publisher and editor; record corrections and retain first publication dates.
3. Separate source facts, model-generated interpretation and human review in the reader's view.
4. Remove invented metrics, unverifiable forecasts and decorative images that appear to document an event.
5. Build topic/category coverage through useful links and archives rather than mass-generated pages.
6. Measure actual crawl/index coverage and page performance after deployment.

## DGX result

The application's CPU services can pull approved feeds, store and export articles, accept draft imports, and perform authenticated publication operations on a DGX host. A GPU is useful for model inference; it does not provide sources, copyright permission, factual verification, distribution agreements or editorial judgment.

In the requested production setup, Vercel enqueues analysis jobs in MongoDB and the DGX worker polls that durable queue, runs its local model, and writes an unreviewed draft result back. Vercel does not need inbound access to a private Spark or a long-running inference HTTP request. The shared MongoDB resource and worker environment still require actual provisioning and a deployment check. See [VERCEL.md](VERCEL.md).

The optional OpenAI-compatible provider makes the summarization path usable with a compatible DGX inference service. NVIDIA documents that deployment pattern in its [DGX Spark vLLM playbook](https://build.nvidia.com/spark/vllm/overview). The actual Atlas `analyzeArticle` adapter and JSON validator passed a live `qwen3.8:27b` test through a temporary SSH tunnel: approximately 50.45 seconds, 204 prompt tokens and 485 completion tokens, with five key points and an explicit missing-context qualification. A separate much smaller optimized JSON fixture took about 7.25 seconds (93 input and 39 output tokens). These are smoke tests, not throughput or factual-accuracy benchmarks; the shorter fixture is not representative of the application's normal request. No model was downloaded or launched, and the temporary tunnel was cleaned up.

The configured SSH alias `DGXSpark001` initially failed because its `.local` hostname did not resolve. A reachable private-network address was subsequently verified using the existing trusted SSH host key. Inspection confirmed an aarch64 host, NVIDIA GB10 GPU and an installed Docker runtime; Ollama is listening on host loopback port 11434, with existing compatible model endpoints also available on the host. BBC world and technology HTTPS feeds returned valid RSS from the DGX during a connectivity check; this does not select those feeds for production or grant reuse rights. No news was published and this application was not deployed on the DGX. [DGX.md](DGX.md) gives the connection and deployment steps without committing private addresses.

Capacity is unresolved: the inspected host was using roughly 93 of 121 GiB RAM and 10 GiB swap. A separate existing news worker reported 1,606 pending, 11 processing and 762 failed jobs even while its health returned `ok`. That worker is not this repository. Investigate its backlog and memory pressure before enabling another scheduled workload; one successful short inference request does not demonstrate spare production capacity.

## Release and operations still required

- Provision/link MongoDB Atlas through Vercel, set the actual production `SITE_URL` and deployment environment, and connect the DGX worker to the same database. Keep any self-hosted app binding private until its proxy is ready.
- Generate separate editor and ingestion secrets; provision real Firebase editor claims if using the browser editor.
- Choose authorized feed URLs and review source/excerpt/image usage before enabling ingestion.
- Review and migrate any existing news as drafts. A newly provisioned MongoDB database starts empty until the import is verified.
- Supply real publisher, author and contact details. Review all policy pages for accuracy.
- Make the DGX private-network address stable and choose a verified inference model configuration.
- Configure MongoDB backups and rehearse a restore; monitor database capacity, failed jobs and ingestion, and retain the audit trail. For optional local SQLite, use the supplied backup tool or persistent container volume.
- Submit and inspect sitemaps in Search Console; check page source, canonical URLs, rich results and unknown-page status through the deployed proxy.
- Record container and live hardware checks independently from local tests. No deployment or inference success is implied by a passing build.

## Validation record

Verified locally on 18 October 2026:

- Node 22 type check and production build pass.
- 26 tests pass with no skips against an isolated MongoDB replica set, including transaction rollback, concurrent writers, source deduplication, draft privacy, authenticated publication, stale revision protection, fenced job claims/retries, and worker completion.
- Production dependency audit reports zero vulnerabilities after removing unused packages, updating the lockfile and overriding the vulnerable transitive gRPC version.
- Vercel CLI preview build succeeds with the Node 22 function, readable HTML template, explicit dynamic routes and static asset output. This is a build, not a live deployment.
- Final ARM64 Docker image builds. Its Mongo-backed runtime passes health, private draft creation, queued analysis (202), reviewed fixture publication, readable article HTML/JSON-LD, RSS/sitemaps, private review notes and real 404 checks. Without MongoDB, production exits instead of creating an empty SQLite store.
- Actual DGX Spark execution of the built worker claims a queued fixture from an isolated MongoDB replica set, invokes the existing local Qwen model and persists a succeeded job with five validated key points, model provenance, two audit events and zero published articles. Test database and temporary worker files are cleaned after verification; no production service is replaced.
- Browser checks pass for desktop/mobile navigation, single current canonical/title/robots metadata, empty/populated news, local bookmarks/preferences and the editorial sign-in guard. A real Firebase editor account was not provisioned during this audit.
- A private snapshot of 2,353 current public articles was downloaded from the existing site. The MongoDB migration rehearsal imported 2,196 canonical drafts, deduplicated 157 repeated source records and reported zero failures. This is the public API snapshot, not proof that every private/backing-store record has been exported. The Spark refuses that site's HTTPS certificate during direct source access; certificate verification was preserved. Fix that trust/hostname issue before using the public site as a Spark source.

The existing Vercel account/project was inspected; no Atlas database is linked. CLI provisioning rejected the MongoDB integration for this account, and the browser requires a fresh sign-in. Cloud database provisioning, full legacy-store export, reviewed migration, production cutover, deployed Firestore rules, publisher configuration and sustained DGX capacity remain release steps. No live cloud migration or production rollout is claimed.

The repository graph was refreshed after implementation. The graph extractor reported semantic file-type warnings; it is a navigation aid rather than a complete runtime dependency model. Generated graph files, test artifacts, credentials and news backups are excluded from Git.

# Vercel, MongoDB Atlas and DGX deployment

The production architecture is:

```text
Readers / editors
       |
       v
Vercel website + authenticated API
       |
       v
MongoDB Atlas: articles, aliases, audit events, durable analysis jobs
       ^
       | outbound database connection
DGX worker ----> existing local model endpoint
```

Vercel serves published pages and records authenticated editorial changes. Analysis requests enqueue durable jobs. The DGX worker claims jobs, runs the local model, validates the result and stores an unreviewed draft. An editor publishes separately. A private Spark model endpoint does not need to be publicly exposed to Vercel.

This guide describes the deployment configuration, not a completed account provisioning or production rollout. A successful local build or model smoke test does not establish that a Vercel project and Atlas cluster have been created and connected.

## 1. Connect the GitHub project

In Vercel, import [theatlastimes](https://github.com/anantm9200/theatlastimes) under the intended personal account or team. Use the repository's build and function configuration. The Node runtime is 22; production web assets and server output are built from the committed lockfile.

Review the selected production branch, project scope and deployment region before deploying. Keep preview deployments separate from production data. Do not attach an untrusted preview to the production database or expose production editor credentials there.

## 2. Provision MongoDB through Vercel

Open the project's Storage/Marketplace integrations and select the native [MongoDB Atlas integration](https://vercel.com/marketplace/mongodbatlas/atlas). Choose or provision the intended resource and connect it to this Vercel project. The integration provisions MongoDB Atlas resources and injects connection settings into selected project environments; the database runs in Atlas. See [MongoDB's Vercel integration guide](https://www.mongodb.com/docs/atlas/reference/partner-integrations/vercel/) and [Vercel Marketplace storage documentation](https://vercel.com/docs/marketplace-storage).

Complete any account, plan, billing and resource choices in the relevant account. Verify which environments receive the integration's credentials and redeploy after adding or changing them. Production and previews should use different databases or separate resources.

Use a database dedicated to this publication; the application's default name is `the_atlas_times`, configurable through `MONGODB_DB_NAME`. Both Vercel and the DGX worker must resolve to the same production database. The store and atomic job completion use MongoDB transactions, so a standalone `mongod` is insufficient; use an Atlas cluster or a properly configured replica set/sharded deployment. See [MongoDB transaction deployment requirements](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).

Check Atlas network access for both services and review the integration's generated settings. Vercel's outbound addressing and Atlas access-list requirements depend on the selected integration/network setup. Use TLS and appropriate database credentials; do not put connection strings into client-visible environment variables, logs or committed files.

## 3. Configure the web environment

Configure the production environment in Vercel:

| Setting | Purpose |
| --- | --- |
| `MONGODB_URI` | Secret Atlas connection string injected by the integration or explicitly configured server-side |
| `MONGODB_DB_NAME` | Optional override of `the_atlas_times`; must agree with the worker |
| `AI_EXECUTION=worker` | Queue analysis for the DGX worker; Vercel also enforces queue execution |
| `SITE_URL` | Actual canonical publication origin, including `https://` |
| `NEWS_API_KEY` | Strong server-to-server editorial credential, at least 32 characters |
| `NEWS_INGEST_KEY` | Independent draft-ingestion credential, at least 32 characters |
| Firebase server authentication settings | Required if using Firebase email/password users with editor/admin claims |

The Vercel web role must use MongoDB. Do not configure `NEWS_DB_PATH` as a production database inside a function: a function's local filesystem is not shared durable storage. Keep scheduled ingestion and model execution on the DGX worker. Public article reads must not initiate paid inference.

For browser editorial access, provision a real Firebase account, its explicit editor/admin claim and the trusted server verification credentials. An ordinary signed-in reader is not an editor. If that provisioning is incomplete, the server-to-server API credential is the available editorial mechanism; do not weaken the role check to make the UI appear operational.

Set model endpoint credentials on the DGX worker. The Vercel role should enqueue jobs rather than call a private DGX address. Vercel Functions have request-duration and resource limits, which is another reason to keep independently running GPU work behind the durable queue; verify the current limits for the selected plan in [Vercel's function documentation](https://vercel.com/docs/functions/limitations).

## 4. Configure the DGX worker

Follow [DGX.md](DGX.md). Supply the production MongoDB connection/database, an existing reachable local model endpoint, the exact served model ID and any inference authentication. Keep API editor secrets off the worker when its direct database job processing does not need them.

The same image includes the web and worker entry points. On the DGX host:

```sh
docker compose --profile dgx up --build -d dgx-worker
docker compose logs --tail 50 dgx-worker
```

The worker opens no listening port. Its DGX Linux profile uses the host network so it can call the existing loopback-only inference service without exposing that API publicly; it also needs outbound Atlas access. For other network modes, provide an explicitly reachable private bridge, tunnel or shared network. See [Docker's host networking behavior](https://docs.docker.com/engine/network/drivers/host/).

Feed ingestion remains opt-in: approve the source URLs and permissions before setting `FEED_URLS` and enabling ingestion on the worker. Do not start duplicate periodic ingesters on Vercel. All collected/generated items remain drafts until editorial review.

## 5. Migrate existing records deliberately

The original Firestore/PostgreSQL stores are not automatically imported, converted or deleted. Export them using trusted credentials, retain a private backup, inspect the records and import through the supported draft workflow into the intended MongoDB database. Preserve supported aliases for existing article links, remove invented scores/dates and unverified imagery, and review every record before publication.

Use `news:sync` for API-based draft transfers when appropriate. Confirm import counts and failures. Do not assume that setting `MONGODB_URI` migrates a local SQLite file or an unrelated pre-existing news worker.

## 6. Verify before switching the public domain

Demonstrate each boundary using non-production fixtures first:

1. Web health confirms the shared store is reachable.
2. Drafts stay absent from public HTML, the public API, RSS and sitemaps.
3. Ingestion credentials can create drafts but cannot publish, delete or export editorial data.
4. An analysis request creates a durable job; the DGX worker claims it and records a validated result.
5. Restarting the worker preserves/reclaims queued work according to the queue policy; failures are visible and retryable.
6. An editor reviews and publishes; the Vercel page source contains the actual headline, source, dates and structured data.
7. RSS and sitemap output uses the canonical public origin; missing/unpublished articles return a real missing-page response.
8. A separate-database backup restore succeeds.

Inspect Vercel function logs, authenticated admin status/job/audit outputs and DGX worker logs. A generic healthy response is not evidence that queued work is being processed. The existing separate DGX news worker observed during this audit had a large backlog and failures despite reporting healthy; investigate capacity before scheduling additional workloads.

After validation, configure the intended custom domain in Vercel and set `SITE_URL` to match it. Submit the sitemaps in Search Console and inspect real deployed URLs. The SEO changes support discovery; they do not guarantee indexing, AI citations or rich results.

## Verification status

Authenticated inspection identified the existing Vercel project `the-atlas-times` and its production domain `www.theatlastimes.com`; no MongoDB integration was attached at that inspection. The existing project used Node 24, so verify/update its runtime to the repository's Node 22 setting when preparing the new deployment.

Trusted DGX hardware inspection, outbound RSS connectivity and the actual analysis adapter/JSON-validation smoke test succeeded against an existing local model service. No newly provisioned Atlas resource, replacement Vercel production deployment, shared-database migration or deployed queue round trip is claimed by those checks. Record account provisioning and the full deployed web → MongoDB → DGX → reviewed publication path as separate release evidence. CI is configured to exercise MongoDB storage and queue transactions against its own disposable replica set; a committed workflow is not a completed CI run.

The local Vercel preview build and isolated MongoDB → actual DGX worker round trip passed. An attempt to provision `mongodb-atlas` through this account's CLI was rejected as unavailable; the browser requires sign-in. Finish resource provisioning through the account dashboard or an authorized Atlas connection before production deployment. The existing production site was left in place.

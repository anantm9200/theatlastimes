# DGX local news service

The DGX owns news collection, analysis, publication checks, image metadata lookup and local MongoDB storage. Vercel remains the public website host and forwards dynamic requests to the protected DGX application. Firebase is removed. See [sources and images](SOURCES.md) and [Vercel connection](VERCEL.md).

## Services

`compose.dgx.yaml` defines a dedicated authenticated MongoDB 8.2 single-node replica set, web service and worker. They use the host network to reach loopback services; MongoDB binds **127.0.0.1:27019**, web binds **127.0.0.1:3011**, and the existing model stays on its original loopback endpoint. No unrelated news worker or model is replaced.

The active installation is `/home/dgxadmin/theatlastimes-app`. `.env.dgx` holds operator/bootstrap configuration; `.env.app` supplies the runtime without Mongo root credentials; `.env.migration` holds temporary legacy connection settings. All are private and excluded from Git and build context. The generated editor login is in the private `editor-credentials.txt` on that host. Do not commit or paste these files into a browser, issue or log.

The old `atlas-times-worker.service` using Atlas has been stopped and disabled. Its configuration remains for rollback. The separate pre-existing Rift Valley service is unchanged.

## Start and inspect

From the application folder on the DGX:

```sh
docker compose --env-file .env.dgx -f compose.dgx.yaml config --quiet
docker compose --env-file .env.dgx -f compose.dgx.yaml up -d mongo
docker compose --env-file .env.dgx -f compose.dgx.yaml exec -T mongo mongosh --nodb --quiet /bootstrap-mongo.js
docker compose --env-file .env.dgx -f compose.dgx.yaml up --build -d web worker
docker compose --env-file .env.dgx -f compose.dgx.yaml ps
docker compose --env-file .env.dgx -f compose.dgx.yaml logs --tail 50 worker
```

On a new machine create private `.env.dgx` and `.env.app` first. Generate distinct random Mongo root/application passwords and service/gateway keys. The application URI uses the application user, authentication database `the_atlas_times`, replica set `atlasLocal` and `directConnection=true`. The bootstrap script reads secrets from the Mongo container environment; it does not print them. Keep root Mongo credentials out of `.env.app`.

The web and worker share the local database. The worker uses `AI_PROVIDER=openai`, the existing loopback `AI_BASE_URL`, exact served `AI_MODEL`, `AI_JSON_MODE=true`, `AI_DISABLE_THINKING=true` and concurrency one. “openai” describes the protocol; these requests go to the local model. No GPU model is downloaded or launched by this deployment.

## Daily ingestion and publication

`.env.app` controls `ENABLE_INGESTION=true`, `AUTO_PUBLISH=true`, `INGESTION_DAILY_AT=06:00`, `INGESTION_TIMEZONE=Asia/Dubai` and `INGESTION_MAX_PER_PUBLISHER=8`. Restart the web/worker services after changing runtime configuration. Daily run records are stored in `news_ingestion_runs`; durable inference jobs are in `news_analysis_jobs`.

The worker checks the schedule once a minute and catches up after a missed start. A Mongo lease prevents duplicate collectors. Completed days stay complete after restart. Collection failures retry at 15-minute intervals, at most three attempts per day. The web server never starts an ingestion timer.

Feed collection retains the original author, date, publisher, URL, excerpt, fuller feed text and reuse terms. Full source text is retained for checks; public briefs show the attributed excerpt and generated summary, linking readers to the complete original. Truncated excerpts, oversized inputs, navigation material and daily photo features cannot pass automatic publication. Fresh drafts enqueue analysis. Only trusted feed jobs with approved terms can automatically publish after global-news and source-grounding checks. The second model check must provide matching source evidence, and numerical claims absent from the input are rejected. Unsupported, stale, local or malformed material stays private. Automated publication is explicitly labeled; it is not human review or independent factual verification.

The supported categories are World, Politics, Business, Technology, Science, Climate, Health, Sports and Culture. Human publication also requires confirmation of global relevance. Legacy/imported/API-supplied drafts do not become trusted feed jobs just by claiming a publisher ID.

## Migration and backups

Run `ATLAS_ENV_FILE=.env.app npm run news:sync -- pull /secure/new-path/news.json` from the DGX application folder to pull published briefs. The same command with `push` sends a JSON inventory as drafts using the separate ingestion key and preserves URL-based retry deduplication. The private environment supplies the loopback API's gateway key; no credentials need to appear in command arguments. Editor APIs additionally support full export, updates, review/publication and deletion.

The previous Atlas resource is retained for rollback. The explicit migration copied 2,196 articles, 6,745 identifiers/aliases, 2,207 audit events and the audit counter into the initially empty local MongoDB database. The script refuses to overwrite a non-empty destination. This preserves the saved public-site inventory; it does not claim discovery/export of unseen private legacy stores.

`deploy/backup-mongo.sh` creates private compressed archives of this dedicated replica set, including its oplog for consistent restores while writes continue, and retains seven days. `atlas-news-backup.timer` runs it daily around 03:00 UTC, with catch-up after downtime. Run `bash deploy/verify-backup.sh` to restore the latest archive with oplog replay into a disposable, network-isolated MongoDB container; it checks news inventory counts and removes that container and its volumes. A same-machine backup does not cover loss of that machine: copy archives to an independent protected location for disaster recovery. Never remove the live Mongo data/key volumes as a cleanup step.

## Connection and verification

Use the existing trusted SSH alias on an active private-network connection. The Mac's Tailscale connection had been stopped during earlier timeouts; reconnecting restored SSH. Keep host-key and TLS verification enabled.

The authenticated DGX web service must be reachable by Vercel through an HTTPS gateway. Tailscale Funnel was requested on port 8443 and reported that tailnet owner enablement is required. No direct MongoDB or inference port is published. Until that enablement and a new Vercel deployment are verified, the previous Vercel preview remains on its earlier configuration.

Verified on the DGX: authenticated replica set, copied migration counts, full ARM64 Docker build, healthy local application, 403 without the gateway key, private/public article separation, Mongo-backed editor login with Secure/HttpOnly cookies and CSRF, a consistent compressed backup restored into an isolated disposable MongoDB container, and 39 tests with no skips. Daily ingestion and checked automatic publication are enabled; use run/job records for current results rather than assuming a running container proves useful work.

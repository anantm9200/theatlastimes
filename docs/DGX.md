# Run the MongoDB-backed news worker on DGX

The application is prepared for a DGX-hosted news workflow and a separate OpenAI-compatible inference server. On 17 October 2026, trusted SSH access through `DGXSpark001` verified an aarch64 DGX Spark with an NVIDIA GB10 GPU, Docker and Ollama listening on host loopback port 11434. The alias's `.local` hostname initially failed; the successful check used a reachable private-network address with the existing trusted host key. Private addresses are not committed here. The actual Atlas analysis adapter and JSON validator passed a live `qwen3.8:27b` request through a temporary SSH tunnel, and outbound RSS fetches succeeded. This application has not been deployed there and no news was published by the checks.

The requested production architecture is Vercel website/API → MongoDB Atlas articles and durable analysis jobs ← DGX worker → existing local inference. Vercel records a job and returns; the worker claims it, analyzes supplied source material, and stores a draft result in the shared database for review. The DGX connects outbound to MongoDB, so Vercel does not need a public route to the private model endpoint. Provision the shared database and web deployment using [VERCEL.md](VERCEL.md).

## What the application supports

| Operation | Application support | DGX requirement |
| --- | --- | --- |
| Pull news | Ingest explicitly configured HTTPS RSS feeds as source-linked drafts | CPU, storage and network; feeds must be authorized |
| Push/import news | Authenticated article creation, with canonical source URL deduplication | Ingestion or editor credential |
| Summarize/analyze | Vercel queues a durable MongoDB job; the worker saves source-grounded, JSON-validated analysis for review | Shared MongoDB access, compatible local inference and a verified model configuration |
| Review/publish/update/archive/delete | Authenticated editorial operations with publication validation | Editor credential or Firebase editor/admin user |
| Export news | Authenticated JSON export; public RSS for published material | Editor credential for complete editorial export |
| Serve the website | Vercel website/API with shared MongoDB Atlas, or an optional self-hosted Node web role | Vercel deployment or a separate web container; the worker does not expose the website |

The workflow does not automatically verify facts, license sources, scrape arbitrary sites, corroborate multiple sources, syndicate to external publishers or post to social accounts. Those need explicit integrations and editorial rules.

## 1. Connect and inspect the machine

Connect the laptop and Spark to a network where the device is reachable, or configure the SSH alias with the device's current reachable private address. NVIDIA's [Sync connection playbook](https://build.nvidia.com/spark/connect-to-your-spark) describes the supported connection workflow. Preserve host-key checking when updating the alias. The verified device used driver 580.178.04 and had active workloads and substantial memory usage, so inspect current capacity before starting another model.

Once connectivity is restored, run these checks in the DGX terminal:

```sh
uname -m
nvidia-smi
docker version
docker compose version
df -h
```

Record the actual architecture, GPU, driver version, available storage and container support before choosing inference software. Existing hardware inspection does not establish spare capacity for an additional model. `DGX` and `DGX Spark` do not identify one universal GPU or model configuration.

The audit snapshot showed about 93/121 GiB RAM in use and 10 GiB swap used. A separate existing news worker had 1,606 pending, 11 processing and 762 failed jobs despite reporting healthy. It is not the Atlas Times application. Investigate that queue and memory pressure before enabling another scheduled ingestion/analysis workload; avoid assuming that a generic healthy response establishes useful throughput.

## 2. Start a compatible inference service

Use the existing compatible model service when its API and model pass the checks below. For a new vLLM deployment, follow NVIDIA's current [Spark vLLM playbook](https://build.nvidia.com/spark/vllm/overview) and [single-device instructions](https://build.nvidia.com/spark/vllm/instructions). Select a recipe that matches the inspected machine and the chosen model's license and resource requirements. The application repository deliberately does not select or download an unverified GPU container or model.

From the application host, check the inference server's health and `/v1/models`, then submit a small `/v1/chat/completions` request using the exact served model ID. Include the server's own authentication if configured. A configured URL alone does not establish that the model is ready or that it follows the required JSON output contract. The audited host endpoint on port 8001 served `qwen3.8:27b`. The actual application adapter test took about 50.45 seconds (204 prompt and 485 completion tokens), returning five key points and an explicit missing-context qualification. A separate tiny fixture with optimized JSON/thinking settings took about 7.25 seconds (93 prompt and 39 completion tokens). The short fixture does not represent normal application latency; neither check establishes production capacity or broad factual accuracy.

Configure the application environment:

```dotenv
AI_PROVIDER=openai
AI_BASE_URL=http://127.0.0.1:8001/v1
AI_MODEL=qwen3.8:27b
AI_API_KEY=replace-with-the-inference-server-key-if-required
```

This example uses the already verified host endpoint; recheck that it is running and serving that model. The `openai` provider name denotes an API format; inference goes to `AI_BASE_URL`. Use an authenticated private endpoint or a private tunnel. The application appends `chat/completions`, so the base URL must include `/v1` and must not already include `/chat/completions`. Leave `AI_API_KEY` unset when the trusted local server does not require one.

Network addresses depend on where each process runs:

| Application location | Inference location | Example base URL |
| --- | --- | --- |
| Native process on DGX | Same DGX host | `http://127.0.0.1:8000/v1` |
| Included worker profile on DGX Linux (host network) | Existing host-loopback service | `http://127.0.0.1:8001/v1` |
| Compose app container on DGX | DGX host | `http://host.docker.internal:8000/v1` |
| App and inference in one Docker network | Inference service named `inference` | `http://inference:8000/v1` |
| Native laptop app | NVIDIA Sync forwarded API | `http://127.0.0.1:8000/v1` |

For the installed Ollama service, substitute port 11434 and the exact installed model ID after validating its compatible API. When using the app container, a host service bound only to `127.0.0.1` needs a private bridge or tunnel reachable by that container; `host.docker.internal` does not make a loopback-only service reachable automatically.

A laptop loopback tunnel is not automatically reachable from an application container. A model service listening only on host loopback may also be unreachable through Docker's host gateway. Choose a reachable private interface or shared Docker network and verify connectivity from the application container before enabling analysis. Do not expose inference directly to the public internet.

Gemini remains optional:

```dotenv
AI_PROVIDER=gemini
GEMINI_MODEL=replace-with-a-model-enabled-for-your-account
GEMINI_API_KEY=replace-with-your-server-side-key
```

Use `AI_PROVIDER=disabled` to run the publication without AI. No provider automatically publishes generated text.

From a Node 22 source checkout with the inference environment configured, `npm run dgx:check` lists served models; `npm run dgx:check -- --generate` exercises the actual application adapter with a clearly fictional test fixture and saves/publishes nothing. It uses the configured URL, so establish any required private tunnel first.

## 3. Configure and start the DGX worker

On the DGX host where the worker will run:

```sh
git clone https://github.com/anantm9200/theatlastimes.git
cd theatlastimes
cp .env.example .env
```

Edit `.env` with the same production `MONGODB_URI` used by Vercel, `MONGODB_DB_NAME=the_atlas_times` (or the same chosen override), local inference settings and approved feed URLs. Keep all credentials in the host environment or a secret manager and never in client-visible variables. The worker's direct MongoDB job processing does not require the editor API secret. Provision separate strong editor/ingestion API secrets on the web deployment for the editorial and API utility workflows; each must be at least 32 characters.

`FEED_URLS` is a JSON array of approved HTTPS URLs and defaults to `[]`. `ENABLE_INGESTION=false` is the default; enable it only after selecting the feeds. Scheduled ingestion stores drafts and does not publish them.

When enabled, the worker performs an initial collection pass and repeats at `FEED_POLL_MS` (default 1,800,000 milliseconds, or 30 minutes). `node dist/dgx-worker.mjs --once` performs one optional collection pass and at most one job per worker slot, then exits. It does not install a daemon or start a web listener.

```sh
docker compose config --quiet
docker compose --profile dgx up --build -d dgx-worker
docker compose ps dgx-worker
docker compose logs --tail 50 dgx-worker
```

The included image uses Node 22 and includes both `dist/server.mjs` (web) and `dist/dgx-worker.mjs` (worker). Build on the target machine, or explicitly produce and test the appropriate architecture with your image builder. The worker calls the already running inference service; its Node container does not require GPU device access itself. The inference service uses the GPU.

The worker profile opens no listening port and stores articles/jobs in MongoDB, not a local SQLite volume. On DGX Linux it shares the host network so the existing loopback-only model remains reachable without rebinding inference publicly. See [Docker's host networking documentation](https://docs.docker.com/engine/network/drivers/host/). Docker Desktop requires explicit host-network support; the worker profile is intended for the Linux DGX host. It must also reach the remote database. Inspect its logs and the authenticated web administration status/job endpoints to verify successful claims and completions; its Compose healthcheck does not pretend to run the web API.

For an optional self-hosted web role, `docker compose up --build -d news` binds port 3000 to `127.0.0.1` by default. With `MONGODB_URI`, that role uses the same shared production store. For optional local SQLite in the production image, explicitly set `NEWS_STORAGE=sqlite`; it uses `NEWS_DB_PATH=/app/data/news.db` in the named `news-data` volume. Missing MongoDB configuration otherwise fails closed. SQLite is never used as Vercel production storage and should not be placed on a network filesystem or shared between independent replicas. Docker documents that [volumes persist separately from containers](https://docs.docker.com/engine/storage/volumes/).

For Firebase browser editing, configure trusted server credentials and provision explicit editor/admin claims using a trusted administrative process. A normal reader login is not permission to publish. The service API keys are for trusted server workflows and must never be pasted into the browser app.

On an unmanaged DGX host, Firebase Admin credentials must be available to the server. If using an Application Default Credentials JSON file, mount it read-only into the container and set `GOOGLE_APPLICATION_CREDENTIALS` to the path **inside the container**. Merely setting a host filesystem path in `.env` does not mount the file. Keep the credential outside the repository and container image. Service-key workflows do not need Firebase Admin credentials.

## 4. Pull, push, analyze and publish

Use a trusted terminal. In the examples, `NEWS_BASE_URL` points to the Vercel web deployment or optional self-hosted web role, and the API credentials are read from the environment.

```sh
export NEWS_BASE_URL=https://replace-with-your-publication-domain
```

Pull the configured feeds on demand:

```sh
curl --fail-with-body -X POST "$NEWS_BASE_URL/api/admin/ingest" \
  -H "Authorization: Bearer $NEWS_INGEST_KEY"
```

Push one source-linked article from a reviewed local JSON file:

```sh
curl --fail-with-body -X POST "$NEWS_BASE_URL/api/news" \
  -H "Authorization: Bearer $NEWS_INGEST_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @draft.json
```

An ingestion credential creates drafts only. A minimal `draft.json` shape is:

```json
{
  "title": "Replace with the source headline",
  "originalUrl": "https://example.com/source-report",
  "sourceName": "Replace with the actual source",
  "sourcePublishedAt": "2026-10-17T08:00:00Z",
  "summary": "Replace with an accurate excerpt you are permitted to use.",
  "category": "World",
  "region": "Global",
  "status": "draft"
}
```

Use the returned article ID to request analysis with an editorial credential:

```sh
curl --fail-with-body -X POST "$NEWS_BASE_URL/api/news/$ARTICLE_ID/analyze" \
  -H "Authorization: Bearer $NEWS_API_KEY"
```

On the MongoDB/Vercel path (`AI_EXECUTION=worker`), this returns HTTP 202 with `job.id` and `job.status`; acceptance is not evidence that inference completed. Inspect `GET /api/admin/jobs/:id` with an editor credential for `queued`, `running`, `succeeded`, `failed` or `superseded`. Superseded means the saved draft revision changed before the result could be applied. Wait for a successful result and then review all generated claims against the original source. Complete the required author/review information before changing the article's status to `published` through the editor API or editor interface. The server rejects publication without its required author, review, summary/body and image-rights fields. Keep original source time distinct from the first publication time assigned by the application.

The worker defaults to one concurrent job (`DGX_WORKER_CONCURRENCY=1`), a five-second poll interval (`DGX_WORKER_POLL_MS=5000`), a renewable three-minute lease (`AI_JOB_LEASE_MS=180000`) and three attempts (`AI_JOB_MAX_ATTEMPTS=3`). Failed attempts use backoff; expired leases can be reclaimed. Results are applied only while the worker owns the lease and the original draft revision still matches, with the article write and job completion in one transaction. After a terminal failure, investigate the cause, save a corrected draft revision and request analysis again. Repeated requests for the same revision resolve to the same job.

The editor can update an article using `PUT /api/news/:id`, archive it using the same endpoint with `status: archived`, and delete it using `DELETE /api/news/:id`. The ingestion credential cannot perform those actions. A published article is not returned to draft; archive it if it must leave the public site.

Inspect editorial counts, ingestion/provider configuration and the audit trail through authenticated `GET /api/admin/status` and `GET /api/admin/audit`. Export the editorial article records:

```sh
curl --fail-with-body "$NEWS_BASE_URL/api/admin/news/export" \
  -H "Authorization: Bearer $NEWS_API_KEY" \
  --output news-export.json
```

Treat exports as private editorial data. Article creation accepts one article per request, not an entire export wrapper. To transfer records, select and validate each item and submit it as a draft; do not assume that foreign IDs or publication/review timestamps can bypass review. JSON export is useful for migration and inspection but is not a complete SQLite backup. Existing Firestore/PostgreSQL content is not automatically converted or deleted; export it and perform a reviewed migration into this new authoritative store.

The source checkout also provides trusted-host command-line helpers (Node 22 and a full `npm ci` installation required):

```sh
export ATLAS_API_URL="$NEWS_BASE_URL"
npm run news:sync -- pull /secure/path/published-news.json
npm run news:sync -- push /secure/path/source-linked-drafts.json
npm run news:export-legacy -- /secure/path/legacy-firestore.json
npm run news:import -- /secure/path/legacy-articles.json
npm run news:backup -- /secure/path/news-backup.db
```

`news:sync pull` downloads public published articles. `push` sends source-linked records with the ingestion credential and forces draft state. `news:export-legacy` performs a read-only Firestore export using trusted Application Default Credentials; keep that private file outside the checkout. PostgreSQL data needs its own reviewed export. `news:import` operates on the explicitly configured store: it accepts a legacy array or export wrapper, resets review and scoring data, strips unverified images and preserves supported legacy aliases for links. Inspect its imported/skipped/failed result and review every draft. These source tools are not included in the minimal production image. The SQLite-specific backup helper is for the optional local store, not an Atlas backup.

Published material is available at `/feed.xml`; the sitemap index is `/sitemap.xml` with page/article shards, and `/news-sitemap.xml` covers recently published articles. Those outputs exclude drafts.

## 5. Preserve data and verify operations

For production, configure an Atlas-supported backup strategy and demonstrate a restore into a separate database. Protect articles, aliases, audit events and queued jobs; a public RSS export is not a database backup. Verify that Vercel and the worker use the intended database before a migration or restore.

For optional local SQLite only, back up the database directory, including any companion files, while the application is stopped, or use the SQLite-aware backup helper. A simple maintenance-window copy is:

```sh
docker compose stop news
mkdir -p backups/news-store
docker compose cp news:/app/data/. backups/news-store/
docker compose start news
```

Keep backups outside the Docker volume, restrict access and rehearse a restore on a separate instance. Do not copy only a live `.db` file while WAL writes may be outstanding. Never run `docker compose down --volumes` unless deleting all stored news is intentional.

Before public launch, demonstrate the complete production path: authorized feed → MongoDB draft → durable job → DGX claim → real inference response → reviewed draft → editor publication → Vercel HTML/RSS/sitemap → worker restart with the job/article state intact → restore into a separate database. Test that reader credentials and the ingestion key cannot publish or delete. Preview deployments must use an isolated database and must not consume production jobs.

Hardware inspection and a small live compatible-inference request succeeded through trusted SSH; the checks did not change DNS, download or launch a model, publish news or deploy this application. Keep the host's existing workloads running while evaluating capacity and avoid downloading or launching another model without checking available memory.

## Installed worker

On 18 October 2026, `atlas-times-worker.service` was enabled under the existing `dgxadmin` user on the Spark. Its working directory is `/home/dgxadmin/theatlastimes-worker`; the private `.env` contains the preview Atlas connection and local model configuration. It opens no listening port. `systemctl --user status atlas-times-worker.service` and `journalctl --user -u atlas-times-worker.service` inspect it; `systemctl --user stop atlas-times-worker.service` stops it. Ingestion is disabled and concurrency is one. This worker is separate from the previously existing news services.

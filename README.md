# The Atlas Times

Source-linked news with a private editorial workflow, readable server HTML, and optional AI-assisted draft analysis on an NVIDIA DGX Spark. Public reads never generate content or invoke AI. There is no fictional fallback news.

The [repository audit](docs/AUDIT.md) explains the original security, news quality, SEO/GEO/AIO and operations problems, fixes, and remaining work. The [DGX guide](docs/DGX.md) covers the verified Spark setup and deployment.

## Run locally

Use **Node 22.12 or newer within 22.x**. Run `npm ci`, copy `.env.example` to `.env.local`, set your canonical `SITE_URL`, then run `npm run dev`. The site starts at `http://127.0.0.1:3000` with an empty news store. `npm run lint`, `npm test`, and `npm run build` validate it. `npm start` runs the built server.

The authoritative production store is **MongoDB Atlas**, selected with `MONGODB_URI` and `MONGODB_DB_NAME` (default `the_atlas_times`). Vercel and the DGX share articles, aliases, audit events and durable AI jobs. Transactions require Atlas or a replica set. Local development can use SQLite at `NEWS_DB_PATH` when MongoDB is absent; production fails closed rather than silently creating an empty database. Explicit `NEWS_STORAGE=sqlite` is available only for a deliberate standalone deployment. Existing Firebase/Postgres records are **not automatically migrated**. Firebase is used only for optional editorial sign-in. Reader bookmarks and preferences stay in the reader's browser.

## Editorial workflow

Open `/editorial`, sign in with Firebase email/password, and use an account with trusted custom claim `editor: true` or `admin: true`. Configure Application Default Credentials or the secret `FIREBASE_SERVICE_ACCOUNT` JSON for the server and use the same Firebase project in the browser and Admin SDK. The checked-in browser config contains public Firebase project identifiers, not administrative credentials. Never put service keys or credentials in `VITE_*` variables.

Create or import a **draft**, check the source, dates, facts, attribution and rights, then publish with an accountable author and a fresh review note. AI analysis is an explicit action on a draft. It is labeled and records model/prompt/source provenance; it cannot publish or invent credibility scores. Updating a published report also requires a new review note. Returning it to draft or archiving removes it from public feeds and sitemaps.

Service clients use `Authorization: Bearer …` with separate random secrets of at least 32 characters. `NEWS_INGEST_KEY` creates source drafts, starts feed collection, and analyzes drafts. `NEWS_API_KEY` also reviews, publishes, edits, deletes, and exports. Keep them private, distinct, and out of URLs. Publish credentials are for trusted editorial tools. The ingestion credential cannot publish, edit published news, delete, or export the editorial database.

`GET /api/news?limit=40&page=1&category=Technology` and `GET /api/news/:id` expose published content only. Protected routes include `/api/admin/news`, `/api/admin/news/:id`, `/api/admin/status`, `/api/admin/audit`, `/api/admin/news/export`, `GET /api/admin/jobs/:id`, and `POST /api/admin/ingest`. Mutations are `POST /api/news`, `PUT /api/news/:id`, `DELETE /api/news/:id`, and `POST /api/news/:id/analyze`.

## Pull, push, and analyze on the Spark

On Vercel set `AI_EXECUTION=worker`; it enqueues analysis and returns HTTP 202 with a job ID. The editor shows progress and reloads the completed draft for review. On the Spark set the same production MongoDB connection/database, `AI_PROVIDER=openai`, a private `AI_BASE_URL` ending in `/v1`, the exact served `AI_MODEL`, and `AI_API_KEY` if required. `npm run dgx:check` discovers models; add `-- --generate` for a real fixture inference without saving news. `AI_JSON_MODE=true` and `AI_DISABLE_THINKING=true` are optional settings for compatible Qwen/vLLM endpoints. The exact adapter was tested successfully on the user's Spark; model availability and performance depend on the host's other workloads.

Run `npm run build` then `npm run dgx:worker` on the Spark, or use the optional `dgx` Docker Compose profile. The worker polls MongoDB, claims one job at a time by default, renews fenced leases, retries bounded failures, and rejects stale article revisions. Generated results remain drafts. With `ENABLE_INGESTION=true`, the worker also collects approved feeds every `FEED_POLL_MS` (default 30 minutes).

`npm run news:sync -- pull /secure/path/news.json` downloads public news from `ATLAS_API_URL`. Set a draft-only `NEWS_INGEST_KEY`, then `npm run news:sync -- push /secure/path/source-drafts.json` pushes sourced drafts with durable URL deduplication. The file can be an article array or `{ "data": [...] }`. Configure approved/licensed HTTPS `FEED_URLS` as a JSON array; set `ENABLE_INGESTION=true` on **one** process for polling every 30 minutes, or call the protected ingest endpoint. Feed items retain their publisher, original URL, excerpt, and source publication date. Feed access is not a license to republish full reports.

## Existing content and backups

Export existing data before deployment. `npm run news:export-legacy -- /secure/path/legacy.json` reads the old Firestore articles using Admin credentials; `FIREBASE_PROJECT_ID` and `LEGACY_FIREBASE_DATABASE_ID` select the source. PostgreSQL rows can be exported as JSON including `rawMetadata`. `npm run news:import -- /secure/path/legacy.json` imports either as private drafts, removes unverified image assignments and reputation scores, keeps source dates separately, and records legacy ID/slug aliases. Review records before publishing. Alias URLs redirect to their stable canonical article URL after publication. Review the import summary; fix failed records and retry. Keep exports private.

For MongoDB use Atlas backups or `mongodump`, including articles, aliases, audits, counters and analysis jobs. Restore into a separate database and verify counts before cutover. The local-only `npm run news:backup -- /secure/path/news-backup.db` uses SQLite's consistent online backup and rejects MongoDB configuration. Restore with the app stopped, preserve the original backup, and test health/article counts before routing traffic. Do not copy only a live `.db` while ignoring its WAL. The protected JSON export is for editorial records; a SQLite backup also retains audit events and aliases.

## Production

Use the existing Vercel project with MongoDB Atlas for production; see [Vercel provisioning and migration](docs/VERCEL.md). The checked-in Vercel handler serves readable dynamic pages, reuses Mongo connections, and never starts background polling. `docker compose --profile dgx up --build -d dgx-worker` runs the separate worker on the Spark. Read [DGX instructions](docs/DGX.md) first. Docker uses `.env`; the default exposed host address is loopback. Set `NODE_ENV=production`, correct public `SITE_URL`, and secure credentials. Put HTTPS in front of public traffic, deploy restrictive `firestore.rules` to **each affected Firebase project**, and migrate existing news before enabling the replacement application. A Git push does not create MongoDB or deploy Firestore rules. A connected Vercel Git integration may deploy code automatically; keep the cutover on a reviewed branch until MongoDB and migration are ready.

Search entry points are `/sitemap.xml`, `/news-sitemap.xml`, and `/feed.xml`. Article pages include visible source links, separate source/publication/modification dates, canonical links, social metadata, and NewsArticle JSON-LD. Unknown articles/pages return real 404s. No special "AI SEO score" or ranking guarantee is claimed; verify the deployed domain in Search Console and validate real published URLs after deployment.

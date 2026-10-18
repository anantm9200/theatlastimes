# The Atlas Times

Global news across World, Politics, Business, Technology, Science, Climate, Health, Sports and Culture. Public reads never generate news or invoke a model. Stories are source-linked; automatic publication is explicitly labeled.

## Deployment

**Vercel → authenticated HTTPS gateway → DGX Docker application → private local MongoDB replica set.** The DGX also runs the daily collector, queued model analysis, publication checks and image selection against its existing local model. MongoDB is bound to loopback and never exposed to Vercel or the internet. Vercel serves static assets and forwards dynamic requests to the DGX.

Use [DGX setup and operations](docs/DGX.md), [Vercel connection](docs/VERCEL.md), and [source/image permissions](docs/SOURCES.md). The [original audit](docs/AUDIT.md) records the earlier implementation and its historical Atlas preview; the current architecture supersedes that deployment.

Firebase is removed from the application, dependencies and editor sign-in. Reader bookmarks/preferences stay in the browser. Editors use a password hash and expiring, HttpOnly, Secure, SameSite sessions stored in MongoDB, with CSRF protection for changes. Service clients retain separate editorial and ingestion credentials.

## Daily operation

The DGX worker checks a persistent schedule once a minute. Defaults: **06:00 Asia/Dubai**, at most eight fresh items per approved publisher, one inference job at a time. A restart after the scheduled hour catches up without repeating a completed run. Failed source collection retries after 15 minutes, up to three attempts per day. Run records and job state remain in MongoDB across container restarts.

Approved feeds create private drafts and durable jobs. Automatic publication requires a trusted feed job, approved source terms, original attribution, a recent valid source time, global significance, a supported category, a second local-model grounding check, exact source evidence and no introduced numerical claims. Incomplete excerpts, navigation and daily photo features are held. Fuller source text stays private for checks; readers receive the attributed excerpt and generated brief. Failed checks stay private. Ordinary API draft submissions and legacy imports do not gain automatic publication merely by naming a publisher. Automated checks are not independent factual verification.

The initial enabled text sources are Global Voices and NASA under their applicable reuse terms. Publisher photography is disabled until its separate permission, allowed hosts and actual image credit are recorded. Wikimedia Commons candidates are checked first; publisher photos retain their supplied URL, colours, aspect ratio and photographer/agency credit, link to the source story and can be disabled per publisher. Image files are not copied or proxied. There is no image-upload endpoint or implemented upload EXIF-stripping claim.

## Local development

Use Node 22.12+ within 22.x. Run `npm ci`, copy `.env.example` to `.env.local`, configure `SITE_URL`, then `npm run dev`. SQLite is available for development; production requires MongoDB with replica-set transactions. The optional Atlas-compatible path remains for rollback and migration, but is not required by the new DGX/Vercel gateway architecture.

`npm run lint`, `npm test` and `npm run build` validate the code. Set `MONGODB_TEST_URI` to an isolated replica set to run all integration tests. `npm start` runs the built server; `npm run dgx:worker` runs the worker. Build and production news workloads run on the DGX.

## Editorial and API operations

Open `/editorial` for login, report queues, daily settings and publisher image switches. New manual reports require explicit confirmation of global relevance. Publication requires a supported category, author, review note, body/summary and image rights when an image is present.

`NEWS_INGEST_KEY` can create source drafts, collect approved feeds and queue analysis. `NEWS_API_KEY` additionally permits review/publication, updates, deletion and export. Credentials must differ and contain at least 32 characters. Keep them out of browser code and URLs.

Public: `GET /api/news`, `GET /api/news/:id`, `/feed.xml`, `/sitemap.xml`, `/news-sitemap.xml`. Protected: `/api/admin/news`, `/api/admin/status`, `/api/admin/ingestion`, `/api/admin/publishers`, `/api/admin/audit`, `/api/admin/jobs/:id`. The DGX origin additionally requires `X-Atlas-Gateway-Key`; Vercel injects it server-side.

`npm run news:sync -- pull /secure/path/news.json` and `news:sync -- push /secure/path/drafts.json` transfer news through the configured API. `npm run news:import` imports legacy JSON as drafts with aliases. `npm run news:migrate-mongo` copies explicitly configured source Mongo collections into an empty target without overwriting data. Full local Mongo backups use `deploy/backup-mongo.sh`; retain an independent off-host copy for disaster recovery.

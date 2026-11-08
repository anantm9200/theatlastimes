# Production recovery — The Atlas Times / DGX Spark

This is the **live** application in `anantm9200/theatlastimes`, not the older `The-Atlas-Times---V2` repo. Vercel serves the public site through an authenticated Tailscale Funnel endpoint terminating on the DGX's loopback-bound web server. The DGX runs MongoDB and the AI worker. Do not expose the vLLM or MongoDB ports publicly, change the Funnel into a raw model endpoint, or run a second V2 publishing service.

## Read-only external checks

```bash
curl -fsS https://www.theatlastimes.com/api/health
curl -fsS 'https://www.theatlastimes.com/api/news?limit=1'
```

Run `node scripts/production-health.mjs` on a machine with Node 22 and internet access. The GitHub workflow `Atlas production availability and freshness` checks every 6 hours and fails if the last published article is older than 48 hours. **A stale feed is not proof of a stopped worker:** source licensing, source freshness and the second automated grounding check may correctly prevent publication. Preserve editorial holds instead of bypassing checks.

## Operator checks on DGX (read only first)

The working application was documented at `/home/dgxadmin/theatlastimes-app`. From an authorised SSH session to the DGX:

```bash
cd /home/dgxadmin/theatlastimes-app
tailscale status
tailscale funnel status
docker compose --env-file .env.dgx -f compose.dgx.yaml ps
docker compose --env-file .env.dgx -f compose.dgx.yaml logs --since 48h --tail 200 worker
docker compose --env-file .env.dgx -f compose.dgx.yaml logs --since 6h --tail 100 web
curl -fsS http://127.0.0.1:8001/v1/models
```

Interpretation:
- **Gateway 200, storage ready, stale articles:** inspect worker logs, pending/retrying jobs, per-day ingestion runs, and held articles. Do not re-import or republish unreviewed stories.
- **DGX model API unavailable:** inspect existing vLLM process and memory usage; do not automatically download/replace models or interrupt unrelated applications.
- **Worker exited:** inspect logs and correct root cause before any restart.
- **MongoDB unavailable:** check disk, memory, replica-set state and existing backup snapshots before changing services.

If logs confirm only the worker is stopped and MongoDB/model are healthy, a targeted authorised restart is:

```bash
docker compose --env-file .env.dgx -f compose.dgx.yaml up -d --no-deps worker
docker compose --env-file .env.dgx -f compose.dgx.yaml logs --tail 100 worker
```

This does not rebuild containers, mutate MongoDB volume data or restart unrelated DGX services. Do not use `down -v`, delete volumes, rerun migrations, or remove editorial checks.

## Source of truth and safe deployment

Production Git repository: `anantm9200/theatlastimes`. The Vercel project uses a prebuilt artifact; ordinary Git pushes are deliberately **not** production deployments. Release only after verification on the DGX and authenticated gateway, using `docs/VERCEL.md`. A GitHub workflow for availability/freshness can run without connecting to the DGX or receiving any credentials.

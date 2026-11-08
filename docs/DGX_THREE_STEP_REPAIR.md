# Three-step DGX Spark news-worker recovery (8 November 2026)

**Important: two different Atlas applications exist on this DGX.** `~/iag-atlas/app` serves Ask Atlas and its model-backed requests, but the published news site is `~/theatlastimes-app`, whose MongoDB queue drives automatic editorial processing. Do not run the older `The-Atlas-Times---V2` publisher.

Current evidence: MongoDB, web and worker containers are up, RSS collection is creating drafts, `/v1/models` on port 8001 exposes `qwen3.8:27b`, and the public site gateway responds 200. Repeated `retry-or-failed` messages must be tied to the persisted Mongo `lastError`; a plain container restart is not a fix.

## 1 — Diagnose the worker (read-only)

On DGX, ensure this repository's latest code is present, without overwriting local modifications:

```bash
cd /home/dgxadmin/theatlastimes-app || exit 1
git status --short
git remote -v
git pull --ff-only origin main
bash deploy/diagnose-worker.sh
```

If this directory has uncommitted changes, an unusual remote or no Git checkout, do not force or reset it. Use the known-good checkout and inspect first. The diagnostic script reads job status counts, the last 12 sanitized errors, ingestion results and publication holds. It does not change any data.

**Privacy:** Review error strings before pasting logs anywhere; redact credentials or private details.

## 2 — Validate inference from inside the actual worker

```bash
cd /home/dgxadmin/theatlastimes-app || exit 1
bash deploy/diagnose-worker.sh --probe
```

The optional probe uses the worker container's **actual** AI configuration against the local `/v1/models` and `/v1/chat/completions`. It returns only model IDs, response-shape validation and duration. It does not save an article.

**Fix based on evidence, never guess:** if `workerModel` differs from `qwen3.8:27b`, align `AI_MODEL` inside private `.env.app` after backing it up. If the probe times out or JSON parsing fails, first inspect vLLM health/configuration and model response, then adjust timeout/JSON mode in a tested branch. If model inference passes but jobs still fail, use the stored `lastError` to identify a database transaction, validation or publication bug. Do not disable grounding checks.

After any verified configuration/code correction, rebuild/recreate **only the worker**, preserve the Mongo volumes and the existing web/Funnel route:

```bash
docker compose --env-file .env.dgx -f compose.dgx.yaml up --build -d --no-deps worker
docker compose --env-file .env.dgx -f compose.dgx.yaml logs --since 10m --tail 100 worker
```

Do **not** run this restart before an actual fix is identified and the modified image is ready.

## 3 — Verify a real new publishing cycle

```bash
bash deploy/diagnose-worker.sh
curl -fsS https://www.theatlastimes.com/api/health
curl -fsS 'https://www.theatlastimes.com/api/news?limit=1'
```

For success we want new worker jobs completing, no unexplained errors, and either a fresh valid published article **or** credible hold reasons explaining why no story qualifies. GitHub's `production-health.yml` monitors reachability/freshness every six hours, but its first run must be confirmed in Actions.

Never use `docker compose down -v`, reset MongoDB, open vLLM to the internet, disable editorial checks, or launch a second legacy publisher.

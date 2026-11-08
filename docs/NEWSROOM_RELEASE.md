# The Atlas Times: newsroom release plan

## Implemented in this branch

- Source-verified Breaking desk: a report is "Breaking" only if published, explicitly tagged, editor-reviewed, and source-dated within 12 hours. An automatically ranked or stale article cannot be breaking.
- Dense front page: feature report, 6 top stories, source wire, nine desks, recent articles, archive links and freshness warnings.
- Functional /latest, /live, /analysis, /topics, /sources, /source/:id, /wire pages, improved /category/:id pagination, consistent responsive navigation and indexable SSR routes.
- Image rights: stored publisher-authorized/Commons photos are displayed with credit; older articles optionally use Wikimedia Commons media metadata with a restrictive CC/PD allowlist, image-description subject matching, direct attribution and a prominent "not event photography" caption. When none exists, a designed typographic editorial graphic replaces the grey missing-photo icon. No fake depiction of real events.
- Expanded eligible official publishers: NOAA and SEC RSS, retaining strict original-source host checks, government-material reuse terms, 48-hour feed freshness and an independent AI publication gate; third-party photos remain disabled.
- Independent read-only official-source headline wire: 96-hour freshness, 10-minute cache, fixed vetted RSS URL and host allowlist, source-attributed external links only, no scraped article body, no AI-generated claims and no breaking status.
- Local Qwen-style <think> wrappers removed before strict JSON parsing; malformed responses still fail closed.

## Validation

2026-11-08 isolated Vercel sandbox validation from branch commit 92df2cc: `npm run lint`, 13 targeted tests and `npm run build` all passed. The sandbox uses Node 24; full native SQLite integration tests were not executable there, because the project requires Node 22 and its native SQLite addon could not be compiled in that sandbox. Run the full suite in the standard Node 22 CI/release environment.

## Production deployment must remain atomic

**Live source repository**: `anantm9200/theatlastimes`. It is separate from the old `The-Atlas-Times---V2` and from the `iag-atlas/app` Ask Atlas project.

**Current architecture**: Vercel serves assets and authenticated forwarding; the DGX web server renders the article/site HTML and serves API responses, while the DGX worker runs MongoDB ingestion, inference and publishing.

An ordinary merge to main is **not** a production release. Git-triggered deployments are disabled. The DGX runtime is not a Git checkout; its deployed container filesystem does not contain repo scripts. The new frontend, server SSR, source-wire API and DGX worker must be deployed from the **same tested revision** to avoid mismatched asset hashes and 404s. See `docs/VERCEL.md` for the existing signed release/rollback process. Avoid rebuilding Vercel alone while DGX serves older HTML.

No production secret, MongoDB volume, model, Tailscale routing or Cloudflare setting is modified by this branch. The remote DGX deployment requires an authorised infrastructure release channel, which is not available to the current GitHub/Vercel app integrations. Do not attempt to deploy through an unauthenticated endpoint or expose SSH/model/database publicly.

## Acceptance criteria for "newsroom live"

1. Vercel and DGX web/worker serve a matched tested revision. Homepage and all new paths HTTP 200, with existing archived articles still available.
2. Headline ticker says **Breaking** only for explicitly reviewed current reports. Otherwise it says **Latest**, and the lead report's age is clearly disclosed.
3. New source wire displays recently verified **external** links or an honest empty state, never fake articles.
4. DGX worker completes a fresh analysis and source-grounding cycle; inspect stored job errors and automated holds. NOAA/SEC publisher seeds are created only when the updated worker starts.
5. Current source-published articles appear across the page with credited photos where metadata and license allow; unmatched photos never appear as event evidence.
6. Verify responsive mobile/tablet/foldable navigation, article images and image attribution, sitemap/robots, crawler-visible metadata and basic accessibility.
7. Check health and latest-article timestamps. If the latest report is stale, flag an operational warning, not invented breaking content.

## Content coverage limitation

NOAA/SEC broaden climate/business primary-source coverage. They cannot substitute for licensed worldwide reporting in politics, health, sports and culture. To publish a genuine high-volume global newsroom, secure publisher RSS/content reuse agreements or add original reporting, then onboard sources with recorded rights and source verification. Do not activate existing disabled BBC/Al Jazeera/The Hindu/Punch full-text feeds without contractual rights.

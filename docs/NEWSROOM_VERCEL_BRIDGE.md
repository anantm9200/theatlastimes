# Vercel newsroom bridge (temporary release path)

The previous published DGX web/worker image does not yet contain the new newsroom code. New Vercel Git builds also lack the `DGX_ORIGIN` and `DGX_GATEWAY_KEY` variables that were passed only into the original prebuilt production deployment.

**Temporary solution:** Vercel serves the tested new Vite frontend, while its API route securely forwards requests to the **existing, pinned, healthy** production Vercel release at `atlas-times-origin-anant-icl.vercel.app`. That immutable release already authenticates to the DGX Funnel. Only the old published article SSR routes are forwarded and rewritten to load the matching *new* frontend JS and CSS. This does not expose MongoDB, vLLM, Tailscale keys, gateway secrets or private addresses.

- `www.theatlastimes.com` maps to the new release after validation and promotion.
- `atlas-times-origin-anant-icl.vercel.app` MUST remain pinned to Vercel deployment `dpl_53ht468Qf9BDJzhGKsVMQpF5w1Ye`; the backend route must never map to the new release, or requests would recurse.
- Existing admin authentication, POST routes, CSRF checks and article publication continue to execute in the existing DGX-backed release. No data is copied or migrated.
- `/api/source-wire` executes a source allowlisted read-only RSS lookup on Vercel, allowing the redesigned homepage to show source headlines independently of AI article jobs.
- For a fully unified release, deploy the same tested revision to the DGX web and worker when authorised host access becomes available. After verification, restore direct `DGX_ORIGIN` + `DGX_GATEWAY_KEY` (stored securely as Vercel env secrets), remove this bridge, and ensure the alias is no longer required.
- This is not a substitute for the currently failing DGX news-analysis jobs; new internal AI-authored articles remain dependent on the worker.
- New front-end routes served as an SPA have client-generated metadata; preserve and verify per-article server-rendered metadata via the forwarded SSR article endpoint.

**Release checks:** `/api/health` 200, `/api/news?limit=1` has data, `/api/source-wire` 200 JSON, `/latest` 200 and new Vite entry assets, `/article/:id` contains server-rendered article text and the *same* entry assets, and admin endpoints remain protected. After promotion, verify the pinned alias still returns 200 before declaring success.

# Vercel with DGX-local MongoDB

Current architecture: **Vercel assets + authenticated HTTPS forwarding → DGX web/API → private local MongoDB**, with collection, model inference and publication checks on the DGX. No Firebase connection is required. The previous Atlas preview remains a rollback source; [the original audit](AUDIT.md) is historical.

## Web configuration

Set server-only `DGX_ORIGIN` to the trusted HTTPS gateway origin (including its port, without a path), and `DGX_GATEWAY_KEY` to the independent secret also configured on the DGX. Do not use a browser-visible `VITE_*` variable. Configure the actual public `SITE_URL` on the DGX. MongoDB credentials and editor password hashes stay off Vercel in this mode.

`api/index.js` forwards dynamic requests when `DGX_ORIGIN` is configured. It fixes the upstream origin, injects gateway authentication, forwards editor sessions and CSRF headers, preserves status/cookies/discovery metadata and never starts a collector or model request. Vercel-overwritten client IPs are passed through the authenticated gateway for rate limiting. Reader-supplied gateway/forwarding credentials are replaced.

If the DGX or its configuration is unavailable, the gateway reports unavailable rather than creating empty local storage or fictional news. There is no database/model fallback in Vercel. Restore an earlier immutable deployment only as an explicit rollback.

## Secure connection

The DGX web port binds loopback and requires the gateway key on every request, including health. A stable HTTPS tunnel exposes that protected application only. MongoDB and the model remain loopback-only. Tailscale Funnel requires the tailnet owner's enablement before a Vercel function outside the tailnet can reach it; ordinary private Tailscale SSH access alone is insufficient. See [Tailscale's requirements](https://tailscale.com/docs/features/tailscale-funnel).

Current status (18 October 2026): the owner enabled Funnel and granted `dgxadmin` local Tailscale operator access. The persistent gateway is active at `https://spark-e2ab.tail86743b.ts.net:8443`, forwarding to loopback port 3011. It was configured with `tailscale funnel --bg --https=8443 --yes http://127.0.0.1:3011`. MongoDB stays private. Unauthenticated requests directly to the gateway return 403.

The DGX-built [protected preview](https://the-atlas-times-7e5evmy1z-anant-icl.vercel.app) passed the full gateway checks before the same artifact was deployed to [www.theatlastimes.com](https://www.theatlastimes.com). The immutable production deployment is [the-atlas-times-4z903nmpz](https://the-atlas-times-4z903nmpz-anant-icl.vercel.app), ID `dpl_53ht468Qf9BDJzhGKsVMQpF5w1Ye`, built from application revision `9c594d6c2bd11aa67990bfd5a6f4865a5158bc05`. No gateway secret was committed or placed in browser-visible code.

Production checks passed for public health/news, private draft denial, service-authenticated duplicate-safe draft submission, editor login and session revocation, Secure/HttpOnly/SameSite cookies, CSRF rejection, daily settings, server-rendered article metadata, matching static assets, RSS, sitemap partitions, news sitemap, robots and real 404 responses. Public-domain health and discovery requests also passed without Vercel authentication or a protection-bypass token.

Deploy the same application revision/assets to both services. The protected Vercel preview should be checked before the public domain is switched. Keep a private database snapshot and the former configuration for rollback.

## Repository and production boundary

All Git changes for this task were pushed only to `anantm9200/theatlastimes`, and the application changes are on `main`. The live Vercel project's Git connection was corrected to that repository. Production serves the DGX-backed release. Automatic Git deployments remain disabled so future source pushes cannot replace a prebuilt release with an unconfigured cloud build.

The full migration count is 2,196 deduplicated drafts from the saved 2,353-record public snapshot, with 6,745 reserved identifiers/aliases. Imported content remains private unless explicitly reviewed; newly collected approved global source briefs may publish automatically after the implemented checks. Private legacy stores outside that inventory have not been claimed as exported.

Run/database backups and inference job state live on the DGX. Large full database backups should use the DGX backup tools rather than Vercel response bodies. Public sitemaps are live; submitting them in the site's search-engine webmaster accounts and inspecting indexing remain account-owner operations. No indexing or AI-citation guarantee is implied.

## Build on the DGX

Run `npm run build && npm run package:vercel` on the DGX. The packager writes a Vercel Build Output API artifact containing static assets and a small Node HTTPS relay with no database/model dependencies or unused Node helper injection. Transfer that artifact to the linked deployment checkout and use `vercel deploy --prebuilt`. Supply the private gateway configuration through environment variables, using `--env DGX_GATEWAY_KEY --env DGX_ORIGIN` to avoid secret values in process arguments. The tested CLI release used `VERCEL_CLI_USE_NATIVE_BINARY=0` after its native uploader stalled. No local or Vercel recompilation is needed for this release workflow. See [Vercel Build Output API](https://vercel.com/docs/build-output-api).

Automatic Git-triggered Vercel deployments are disabled in `vercel.json`, so a source push cannot replace the DGX-built release with a cloud build or omit its gateway configuration. GitHub validation still runs. Code releases use the explicit DGX build and prebuilt deployment workflow; daily news updates require no new site deployment.

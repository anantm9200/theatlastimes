# Vercel with DGX-local MongoDB

Current architecture: **Vercel assets + authenticated HTTPS forwarding → DGX web/API → private local MongoDB**, with collection, model inference and publication checks on the DGX. No Firebase connection is required. The previous Atlas preview remains a rollback source; [the original audit](AUDIT.md) is historical.

## Web configuration

Set server-only `DGX_ORIGIN` to the trusted HTTPS gateway origin (including its port, without a path), and `DGX_GATEWAY_KEY` to the independent secret also configured on the DGX. Do not use a browser-visible `VITE_*` variable. Configure the actual public `SITE_URL` on the DGX. MongoDB credentials and editor password hashes stay off Vercel in this mode.

`api/index.js` forwards dynamic requests when `DGX_ORIGIN` is configured. It fixes the upstream origin, injects gateway authentication, forwards editor sessions and CSRF headers, preserves status/cookies/discovery metadata and never starts a collector or model request. Vercel-overwritten client IPs are passed through the authenticated gateway for rate limiting. Reader-supplied gateway/forwarding credentials are replaced.

If the DGX or its configuration is unavailable, the gateway reports unavailable rather than creating empty local storage or fictional news. There is no database/model fallback in Vercel. Restore an earlier immutable deployment only as an explicit rollback.

## Secure connection

The DGX web port binds loopback and requires the gateway key on every request, including health. A stable HTTPS tunnel exposes that protected application only. MongoDB and the model remain loopback-only. Tailscale Funnel requires the tailnet owner's enablement before a Vercel function outside the tailnet can reach it; ordinary private Tailscale SSH access alone is insufficient. See [Tailscale's requirements](https://tailscale.com/docs/features/tailscale-funnel).

Current status: private DGX application and database are deployed and tested. Funnel reported disabled for the tailnet; its owner enablement is pending. Do not claim the Vercel→DGX cutover succeeded until health, authenticated mutations, editor cookies, server-rendered articles, RSS/sitemaps and missing-page responses pass through the deployed gateway.

Deploy the same application revision/assets to both services. The protected Vercel preview should be checked before the public domain is switched. Keep a private database snapshot and the former configuration for rollback.

## Repository and production boundary

All Git changes for this task belong only to `anantm9200/theatlastimes`. The existing live Vercel project's Git link was `The-Atlas-Times---V2` during the audit. Its production connection/domain have not been switched as part of the pending gateway step. Resolve that intended production connection before allowing automatic Git deployments to replace the new setup.

The full migration count is 2,196 deduplicated drafts from the saved 2,353-record public snapshot, with 6,745 reserved identifiers/aliases. Imported content remains private unless explicitly reviewed; newly collected approved global source briefs may publish automatically after the implemented checks. Private legacy stores outside that inventory have not been claimed as exported.

Run/database backups and inference job state live on the DGX. Large full database backups should use the DGX backup tools rather than Vercel response bodies. Submit the public sitemaps and inspect production URLs after the actual cutover; no indexing or AI-citation guarantee is implied.

## Build on the DGX

Run `npm run build && npm run package:vercel` on the DGX. The packager writes a Vercel Build Output API artifact containing static assets and a small Node HTTPS relay with no database/model dependencies. Transfer that artifact to the linked deployment checkout and use `vercel deploy --prebuilt`. No local or Vercel recompilation is needed for this release workflow. See [Vercel Build Output API](https://vercel.com/docs/build-output-api).

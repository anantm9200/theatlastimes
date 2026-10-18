import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { absoluteUrl, DEFAULT_DESCRIPTION, INDEX_ROBOTS, serializeJsonLd, SITE_NAME, siteOrigin } from "./seo";

export function browserSiteOrigin(): string {
  const configured = (import.meta as ImportMeta & { env?: { VITE_SITE_URL?: string } }).env?.VITE_SITE_URL;
  const serverOrigin = typeof document === "undefined" ? undefined : document.querySelector<HTMLMetaElement>('meta[name="atlas:site-url"]')?.content;
  return siteOrigin(serverOrigin || configured, typeof window === "undefined" ? undefined : window.location.origin);
}

export default function SeoHead({ title = SITE_NAME, description = DEFAULT_DESCRIPTION, path, image, article = false, noindex = false, structuredData }: {
  title?: string; description?: string; path?: string; image?: string; article?: boolean; noindex?: boolean; structuredData?: unknown;
}) {
  const location = useLocation();
  const canonical = absoluteUrl(path || location.pathname, browserSiteOrigin());
  const fullTitle = title === SITE_NAME ? `${SITE_NAME} | Global News & Analysis` : `${title} | ${SITE_NAME}`;
  return <Helmet>
    <title>{fullTitle}</title>
    <meta name="description" content={description} />
    <meta name="robots" content={noindex ? "noindex, follow" : INDEX_ROBOTS} />
    <link rel="canonical" href={canonical} />
    <meta property="og:site_name" content={SITE_NAME} />
    <meta property="og:title" content={fullTitle} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content={article ? "article" : "website"} />
    <meta property="og:url" content={canonical} />
    {image && <meta property="og:image" content={absoluteUrl(image, browserSiteOrigin())} />}
    <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
    <meta name="twitter:title" content={fullTitle} />
    <meta name="twitter:description" content={description} />
    {image && <meta name="twitter:image" content={absoluteUrl(image, browserSiteOrigin())} />}
    {structuredData && <script type="application/ld+json">{serializeJsonLd(structuredData)}</script>}
  </Helmet>;
}

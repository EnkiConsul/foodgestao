import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { PUBLIC_SITE_ORIGIN } from "@/lib/siteOrigin";

const SITE_ORIGIN = PUBLIC_SITE_ORIGIN;

/**
 * Emits a canonical <link> and <meta property="og:url"> pointing to the
 * aveto360.com origin for the current route on every page.
 *
 * Mount once inside the router; per-page <Helmet> title/description still work,
 * and this override wins for og:url thanks to Helmet's property-based dedupe.
 * Query strings and hashes are intentionally stripped so canonicals collapse
 * variants to a single indexable URL.
 */
export function CanonicalUrl() {
  const { pathname } = useLocation();
  // Normalize: strip trailing slash except for root, collapse duplicate slashes.
  const normalized =
    pathname === "/"
      ? "/"
      : pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  const url = `${SITE_ORIGIN}${normalized}`;
  return (
    <Helmet>
      <link rel="canonical" href={url} />
      <meta property="og:url" content={url} />
    </Helmet>
  );
}

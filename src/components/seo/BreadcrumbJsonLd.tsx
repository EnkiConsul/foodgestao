import { Helmet } from "react-helmet-async";

const SITE_ORIGIN = "https://aveto360.com";

export type BreadcrumbItem = {
  name: string;
  /** Route path (e.g. "/guias/das-mei"). Omit for the current page's last crumb if desired. */
  path: string;
};

type Props = {
  /** Ordered from Home to current page. Home is prepended automatically if absent. */
  items: BreadcrumbItem[];
};

/**
 * Emits a Schema.org BreadcrumbList JSON-LD for the current page.
 * Rich-result eligible on Google when items resolve to valid, canonical URLs.
 */
export function BreadcrumbJsonLd({ items }: Props) {
  const hasHome = items[0]?.path === "/";
  const full: BreadcrumbItem[] = hasHome
    ? items
    : [{ name: "Início", path: "/" }, ...items];

  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: full.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path}`,
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
}

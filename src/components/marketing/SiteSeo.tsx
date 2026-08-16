import { Helmet } from "react-helmet-async";
import { SITE_ORIGIN } from "@/lib/marketing/content";

type Props = {
  title: string;
  description: string;
  /** Caminho da rota, ex: "/financeiro". Usado em og:url. */
  path: string;
  image?: string;
  noindex?: boolean;
  /** JSON-LD extras da página. */
  jsonLd?: Record<string, unknown>[];
  type?: "website" | "article";
};

export function SiteSeo({ title, description, path, image, noindex, jsonLd, type = "website" }: Props) {
  const url = `${SITE_ORIGIN}${path === "/" ? "/" : path.replace(/\/+$/, "")}`;
  const ogImage = image || `${SITE_ORIGIN}/og-image.png?v=2`;

  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:locale" content="pt_BR" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {(jsonLd ?? []).map((data, index) => (
        <script type="application/ld+json" key={index}>
          {JSON.stringify(data)}
        </script>
      ))}
    </Helmet>
  );
}

export const softwareApplicationLd = (name: string, description: string, path: string) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name,
  description,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: `${SITE_ORIGIN}${path}`,
  inLanguage: "pt-BR",
  publisher: { "@type": "Organization", name: "360°FOOD", url: `${SITE_ORIGIN}/` },
});

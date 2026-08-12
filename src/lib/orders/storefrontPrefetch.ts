/**
 * Pré-cache do cardápio público (/c/:slug).
 *
 * Objetivo: primeira pintura quase instantânea depois de um update, sem
 * Service Worker (removido de propósito — cache de app-shell antigo já quebrou
 * rotas públicas antes). A estratégia tem três camadas:
 *
 * 1. Rota: aquece o chunk lazy de `LojaOnline` antes do clique/abertura.
 * 2. Dados: snapshot do RPC `storefront_public_get` em localStorage (TTL curto),
 *    usado como `initialData` do React Query e revalidado em background.
 * 3. Mídia: `link rel=preload/prefetch` para logo, banner e as primeiras
 *    imagens de produto, que são as que dominam o tempo percebido.
 */

import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storefrontMediaUrl, type PublicStorefront, type PublicStorefrontResult } from "./storefront";

const SNAPSHOT_PREFIX = "sf-snapshot:";
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000; // 6h
/** Imagens de produto pré-carregadas (as demais carregam sob demanda). */
const MEDIA_PRELOAD_LIMIT = 8;

export function storefrontQueryKey(slug: string) {
  return ["storefront-public", slug] as const;
}

// ---------------- 1. Rota ----------------

let routeWarmed: Promise<unknown> | null = null;

/** Baixa o chunk da página pública para que a navegação não espere a rede. */
export function warmStorefrontRoute() {
  if (routeWarmed) return routeWarmed;
  routeWarmed = import("@/pages/storefront/LojaOnline").catch(() => undefined);
  return routeWarmed;
}

// ---------------- 2. Dados ----------------

interface Snapshot {
  savedAt: number;
  data: PublicStorefrontResult;
}

export function readStorefrontSnapshot(slug: string | undefined): Snapshot | null {
  if (!slug || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed?.data || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > SNAPSHOT_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStorefrontSnapshot(slug: string, data: PublicStorefrontResult) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SNAPSHOT_PREFIX + slug, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Cota cheia / modo privado: o cache é opcional.
  }
}

/** Busca o cardápio e guarda o snapshot (usado pelo hook e pelo prefetch). */
export async function fetchStorefront(slug: string): Promise<PublicStorefrontResult> {
  const { data, error } = await supabase.rpc("storefront_public_get", { p_slug: slug });
  if (error) throw error;
  const result = (data ?? { found: false }) as PublicStorefrontResult;
  if ((result as PublicStorefront).found) writeStorefrontSnapshot(slug, result);
  return result;
}

/** Aquece rota + dados + mídia de um slug (chame no hover/mount do painel). */
export async function prefetchStorefront(queryClient: QueryClient, slug: string | undefined) {
  if (!slug) return;
  void warmStorefrontRoute();
  try {
    await queryClient.prefetchQuery({
      queryKey: storefrontQueryKey(slug),
      queryFn: () => fetchStorefront(slug),
      staleTime: 60_000,
    });
    const cached = queryClient.getQueryData<PublicStorefrontResult>(storefrontQueryKey(slug));
    if (cached && (cached as PublicStorefront).found) {
      preloadStorefrontMedia(cached as PublicStorefront, "prefetch");
    }
  } catch {
    // Prefetch é best-effort.
  }
}

// ---------------- 3. Mídia ----------------

const preloaded = new Set<string>();

function addLink(href: string, rel: "preload" | "prefetch") {
  if (typeof document === "undefined" || preloaded.has(href)) return;
  preloaded.add(href);
  const link = document.createElement("link");
  link.rel = rel;
  link.as = "image";
  link.href = href;
  document.head.appendChild(link);
}

/** Enfileira logo, banner e as primeiras imagens de produto. */
export function preloadStorefrontMedia(store: PublicStorefront, rel: "preload" | "prefetch" = "preload") {
  const slug = store.store.slug;
  const urls: string[] = [];

  const logo = storefrontMediaUrl(slug, "ped-storefront", store.store.logo_url);
  const banner = storefrontMediaUrl(slug, "ped-storefront", store.store.banner_url);
  if (banner) urls.push(banner);
  if (logo) urls.push(logo);

  for (const category of store.categories ?? []) {
    for (const product of category.products ?? []) {
      if (urls.length >= MEDIA_PRELOAD_LIMIT + 2) break;
      const image = storefrontMediaUrl(slug, "ped-produtos", product.image_path);
      if (image) urls.push(image);
    }
    if (urls.length >= MEDIA_PRELOAD_LIMIT + 2) break;
  }

  urls.forEach((url, index) => addLink(url, index < 2 ? rel : "prefetch"));
}

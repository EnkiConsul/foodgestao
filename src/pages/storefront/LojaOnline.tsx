import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Bike,
  Clock,
  CreditCard,
  Flame,
  Loader2,
  MapPin,
  MessageCircle,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Store,
  Timer,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StorefrontProductSheet from "@/components/storefront/StorefrontProductSheet";
import StorefrontCheckoutSheet from "@/components/storefront/StorefrontCheckoutSheet";
import StorefrontTrackDialog from "@/components/storefront/StorefrontTrackDialog";
import { usePublicStorefront } from "@/hooks/usePublicStorefront";
import type { PlacedOrder } from "@/hooks/usePublicStorefront";
import {
  cartCount,
  cartSubtotal,
  cartToWhatsappText,
  formatCents,
  groupHoursByWeekday,
  isStorefrontOpen,
  nextOpeningLabel,
  storefrontMediaUrl,
  themeStyle,
  whatsappLink,
  type CartItem,
  type PublicCategory,
  type PublicProduct,
  type PublicStorefront,
} from "@/lib/orders/storefront";
import { PUBLIC_SITE_ORIGIN } from "@/lib/siteOrigin";

/** Normaliza texto para busca (sem acento, minúsculo). */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Menor preço do produto considerando tamanhos (variantes). */
function fromPrice(p: PublicProduct) {
  if (p.variants.length > 0) return Math.min(...p.variants.map((v) => v.price_cents));
  return p.price_cents;
}

export default function LojaOnline() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = usePublicStorefront(slug);

  const [items, setItems] = useState<CartItem[]>([]);
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ number: number; phone: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [compact, setCompact] = useState(false);

  const store = data && data.found ? (data as PublicStorefront) : null;
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const addItem = (item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.key === item.key);
      if (existing) {
        return prev.map((i) =>
          i.key === item.key ? { ...i, quantity: Math.min(50, i.quantity + item.quantity) } : i,
        );
      }
      return [...prev, item];
    });
  };

  const changeQuantity = (key: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.key !== key));
      return;
    }
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(50, quantity) } : i)));
  };

  const onPlaced = (order: PlacedOrder, phone: string) => {
    setItems([]);
    setLastOrder({ number: order.display_number, phone });
  };

  const openNow = store ? isStorefrontOpen(store) : false;
  const nextOpening = store ? nextOpeningLabel(store) : null;
  const hours = useMemo(() => (store ? groupHoursByWeekday(store.hours) : []), [store]);

  /** Cardápio filtrado pela busca. */
  const categories: PublicCategory[] = useMemo(() => {
    if (!store) return [];
    const q = normalize(query.trim());
    if (!q) return store.categories;
    return store.categories
      .map((c) => ({
        ...c,
        products: c.products.filter(
          (p) => normalize(p.name).includes(q) || normalize(p.description ?? "").includes(q),
        ),
      }))
      .filter((c) => c.products.length > 0);
  }, [store, query]);

  /** Destaques: itens com foto, para a vitrine horizontal. */
  const highlights = useMemo(() => {
    if (!store) return [];
    return store.categories
      .flatMap((c) => c.products)
      .filter((p) => p.available && p.image_path)
      .slice(0, 8);
  }, [store]);

  // Header compacto ao rolar
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 180);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy das categorias
  useEffect(() => {
    if (categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target?.id) setActiveCategory(visible.target.id.replace("cat-", ""));
      },
      { rootMargin: "-120px 0px -70% 0px", threshold: 0 },
    );
    categories.forEach((c) => {
      const el = sectionRefs.current[c.id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [categories]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !store) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Helmet>
          <title>Cardápio não encontrado — 360°FOOD</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <Store className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-lg font-semibold">Cardápio não encontrado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Este link não existe ou a loja ainda não foi publicada. Confira o endereço com o estabelecimento.
        </p>
      </div>
    );
  }

  const logo = storefrontMediaUrl(store.store.slug, "ped-storefront", store.store.logo_url);
  const banner = storefrontMediaUrl(store.store.slug, "ped-storefront", store.store.banner_url);
  const count = cartCount(items);
  const subtotal = cartSubtotal(items);
  const minOrder = store.unit.min_order_amount ?? 0;
  const missingToMin = Math.max(0, minOrder - subtotal);
  const minFee = store.zones.length > 0 ? Math.min(...store.zones.map((z) => z.fee_amount)) : null;
  const freeDelivery = store.zones.some((z) => z.fee_amount === 0);
  const description =
    store.store.headline?.trim() ||
    store.store.about?.trim()?.slice(0, 150) ||
    `Cardápio online de ${store.unit.name}. Peça pizza para entrega ou retirada.`;

  const scrollToCategory = (id: string) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 104;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveCategory(id);
  };

  const openProduct = (p: PublicProduct) => {
    setProduct(p);
    setProductOpen(true);
  };

  return (
    <div
      className="min-h-screen pb-36 antialiased"
      style={{
        ...themeStyle(store.store.theme, store.store.primary_color),
        background: "var(--sf-bg)",
        color: "var(--sf-text)",
        fontFamily: "var(--sf-font-body)",
      }}
    >

      <Helmet>
        <title>{`${store.unit.name} — Cardápio online`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${PUBLIC_SITE_ORIGIN}/c/${store.store.slug}`} />
        <meta property="og:title" content={`${store.unit.name} — Cardápio online`} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${PUBLIC_SITE_ORIGIN}/c/${store.store.slug}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="theme-color" content={store.store.primary_color} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Restaurant",
            name: store.unit.name,
            url: `${PUBLIC_SITE_ORIGIN}/c/${store.store.slug}`,
            servesCuisine: "Pizza",
            priceRange: "$$",
            telephone: store.store.whatsapp_phone ?? undefined,
            openingHoursSpecification: store.hours.map((h) => ({
              "@type": "OpeningHoursSpecification",
              dayOfWeek: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][h.weekday],
              opens: h.opens_at.slice(0, 5),
              closes: h.closes_at.slice(0, 5),
            })),
            hasMenu: {
              "@type": "Menu",
              hasMenuSection: store.categories.map((c) => ({
                "@type": "MenuSection",
                name: c.name,
                hasMenuItem: c.products.map((p) => ({
                  "@type": "MenuItem",
                  name: p.name,
                  description: p.description ?? undefined,
                  offers: {
                    "@type": "Offer",
                    price: (fromPrice(p) / 100).toFixed(2),
                    priceCurrency: "BRL",
                    availability: p.available
                      ? "https://schema.org/InStock"
                      : "https://schema.org/OutOfStock",
                  },
                })),
              })),
            },
          })}
        </script>
      </Helmet>

      {/* Barra fixa compacta */}
      <div
        className={`fixed inset-x-0 top-0 z-30 border-b transition-transform duration-200 ${
          compact ? "translate-y-0" : "-translate-y-full"
        }`}
        style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
          {logo && (
            <img
              src={logo}
              alt=""
              className="h-8 w-8 shrink-0 rounded-md object-cover"
              style={{ border: "1px solid var(--sf-border)" }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{store.unit.name}</p>
            <p className="text-[11px]" style={{ color: "var(--sf-muted)" }}>
              {openNow ? "Aberto agora" : nextOpening ?? "Fechado"}
            </p>
          </div>
          {store.store.online_cart_enabled && count > 0 && (
            <Button
              size="sm"
              className="h-8 border-0"
              style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
              onClick={() => setCheckoutOpen(true)}
            >
              <ShoppingBag className="mr-1.5 h-3.5 w-3.5" /> {count}
            </Button>
          )}
        </div>
      </div>

      {/* Capa */}
      <header>
        <div className="relative h-40 w-full overflow-hidden sm:h-64" style={{ background: "var(--sf-primary)" }}>
          {banner && (
            <img
              src={banner}
              alt=""
              loading="eager"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,.65), rgba(0,0,0,.15) 55%, rgba(0,0,0,0))" }}
          />
        </div>

        <div className="relative z-10 mx-auto -mt-12 max-w-3xl px-4">
          <div
            className="rounded-2xl border p-4 shadow-lg"
            style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border shadow-sm sm:h-24 sm:w-24"
                style={{ borderColor: "var(--sf-border)", background: "var(--sf-bg)" }}
              >
                {logo ? (
                  <img src={logo} alt={`Logo de ${store.unit.name}`} className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-8 w-8" style={{ color: "var(--sf-muted)" }} aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                    style={
                      openNow
                        ? { background: "var(--sf-primary)", color: "var(--sf-on-primary)" }
                        : { background: "var(--sf-border)", color: "var(--sf-text)" }
                    }
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: openNow ? "var(--sf-on-primary)" : "var(--sf-muted)" }}
                    />
                    {openNow ? "Aberto agora" : "Fechado"}
                  </span>
                  {!openNow && nextOpening && (
                    <span className="text-xs" style={{ color: "var(--sf-muted)" }}>
                      {nextOpening}
                    </span>
                  )}
                </div>
                <h1 className="mt-1.5 text-xl font-extrabold leading-tight sm:text-2xl">{store.unit.name}</h1>
                {store.store.headline && (
                  <p className="mt-0.5 text-sm" style={{ color: "var(--sf-muted)" }}>
                    {store.store.headline}
                  </p>
                )}
              </div>
            </div>

            {/* Confiança: prazo, entrega, mínimo, pagamento */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <InfoTile
                icon={<Timer className="h-4 w-4" />}
                label="Preparo"
                value={`${store.unit.prep_time_minutes} min`}
              />
              <InfoTile
                icon={<Bike className="h-4 w-4" />}
                label="Entrega"
                value={
                  freeDelivery ? "Grátis" : minFee !== null ? `a partir de ${formatCents(minFee)}` : "Retirada"
                }
              />
              <InfoTile
                icon={<ShoppingBag className="h-4 w-4" />}
                label="Pedido mínimo"
                value={minOrder > 0 ? formatCents(minOrder) : "Sem mínimo"}
              />
              <InfoTile
                icon={<CreditCard className="h-4 w-4" />}
                label="Pagamento"
                value={
                  store.payment_options.length > 0
                    ? store.payment_options
                        .slice(0, 2)
                        .map((p) => p.label)
                        .join(", ")
                    : "Na entrega"
                }
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {store.store.whatsapp_phone && (
                <Button
                  size="sm"
                  variant="outline"
                  style={{ borderColor: "var(--sf-border)", color: "var(--sf-text)", background: "transparent" }}
                  asChild
                >
                  <a
                    href={whatsappLink(
                      store.store.whatsapp_phone,
                      items.length > 0
                        ? cartToWhatsappText(items, store.unit.name)
                        : `Olá! Vi o cardápio de ${store.unit.name} e quero fazer um pedido.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" /> Pedir no WhatsApp
                  </a>
                </Button>
              )}
              <StorefrontTrackDialog
                slug={store.store.slug}
                initialNumber={lastOrder?.number}
                initialPhone={lastOrder?.phone}
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    style={{ borderColor: "var(--sf-border)", color: "var(--sf-text)", background: "transparent" }}
                  >
                    <Receipt className="mr-2 h-4 w-4" /> Acompanhar pedido
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {!openNow && (
          <div
            className="mt-4 rounded-xl border p-3 text-sm"
            style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
          >
            <p className="font-semibold">A loja está fechada agora</p>
            <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
              {nextOpening ? `${nextOpening}. Você pode montar o pedido e enviar na abertura.` : "Confira os horários abaixo."}
            </p>
          </div>
        )}

        {/* Destaques */}
        {highlights.length > 0 && !query && (
          <section className="mt-6">
            <h2 className="flex items-center gap-1.5 text-base font-bold">
              <Flame className="h-4 w-4" style={{ color: "var(--sf-primary)" }} aria-hidden="true" /> Destaques
            </h2>
            <div className="-mx-4 mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
              {highlights.map((p) => {
                const image = storefrontMediaUrl(store.store.slug, "ped-produtos", p.image_path);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openProduct(p)}
                    className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border text-left transition hover:opacity-95"
                    style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
                  >
                    {image && <img src={image} alt={p.name} loading="lazy" className="h-28 w-full object-cover" />}
                    <div className="p-2.5">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</p>
                      <p className="mt-1 text-sm font-bold" style={{ color: "var(--sf-primary)" }}>
                        {p.variants.length > 0 && (
                          <span className="mr-1 text-[10px] font-medium" style={{ color: "var(--sf-muted)" }}>
                            a partir de
                          </span>
                        )}
                        {formatCents(fromPrice(p))}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Busca + navegação por categorias */}
        <div
          className="sticky top-[52px] z-20 -mx-4 mt-4 space-y-2 px-4 pb-2 pt-2"
          style={{ background: "var(--sf-bg)" }}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--sf-muted)" }}
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no cardápio (ex.: calabresa)"
              aria-label="Buscar no cardápio"
              className="h-11 rounded-full pl-9 pr-9"
              style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)", color: "var(--sf-text)" }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--sf-muted)" }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {categories.length > 1 && (
            <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Categorias do cardápio">
              {categories.map((c) => {
                const active = activeCategory === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => scrollToCategory(c.id)}
                    className="whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition"
                    style={
                      active
                        ? {
                            background: "var(--sf-primary)",
                            color: "var(--sf-on-primary)",
                            borderColor: "var(--sf-primary)",
                          }
                        : { borderColor: "var(--sf-border)", background: "var(--sf-surface)" }
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Cardápio vazio */}
        {store.categories.length === 0 && (
          <div
            className="mt-8 rounded-xl border p-6 text-center"
            style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
          >
            <p className="text-sm font-semibold">Cardápio em montagem</p>
            <p className="mt-1 text-xs" style={{ color: "var(--sf-muted)" }}>
              Os itens desta loja serão publicados em breve.
            </p>
            {store.store.whatsapp_phone && (
              <a
                href={whatsappLink(store.store.whatsapp_phone, `Olá! Vi o cardápio de ${store.unit.name}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold"
                style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
              >
                Falar no WhatsApp
              </a>
            )}
          </div>
        )}

        {store.categories.length > 0 && categories.length === 0 && (
          <div className="mt-8 text-center">
            <p className="text-sm font-semibold">Nenhum item encontrado para “{query}”</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              style={{ borderColor: "var(--sf-border)", color: "var(--sf-text)", background: "transparent" }}
              onClick={() => setQuery("")}
            >
              Limpar busca
            </Button>
          </div>
        )}

        {categories.map((category) => (
          <section
            key={category.id}
            id={`cat-${category.id}`}
            ref={(el) => {
              sectionRefs.current[category.id] = el;
            }}
            className="mt-7 scroll-mt-28"
          >
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold sm:text-2xl" style={{ fontFamily: "var(--sf-font-head)" }}>
                {category.name}
              </h2>
              <span className="h-px flex-1" style={{ background: "var(--sf-border)" }} aria-hidden="true" />
              <span className="text-xs" style={{ color: "var(--sf-muted)" }}>
                {category.products.length} {category.products.length === 1 ? "item" : "itens"}
              </span>
            </div>
            {category.description && (
              <p className="mt-1 text-xs" style={{ color: "var(--sf-muted)" }}>
                {category.description}
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {category.products.map((p) => {
                const image = storefrontMediaUrl(store.store.slug, "ped-produtos", p.image_path);
                const price = fromPrice(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!p.available}
                    onClick={() => openProduct(p)}
                    className="group relative flex w-full items-stretch gap-4 rounded-3xl border p-4 text-left transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
                  >
                    <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl sm:h-32 sm:w-32">
                      {image ? (
                        <img
                          src={image}
                          alt={p.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center"
                          style={{ background: "var(--sf-accent)" }}
                        >
                          <Store className="h-6 w-6" style={{ color: "var(--sf-muted)" }} aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <h3
                          className="min-w-0 text-base font-bold leading-tight sm:text-lg"
                          style={{ fontFamily: "var(--sf-font-head)" }}
                        >
                          {p.name}
                        </h3>
                        {p.available && (
                          <span
                            className="shrink-0 text-base font-bold tabular-nums sm:text-lg"
                            style={{ color: "var(--sf-primary)", fontFamily: "var(--sf-font-head)" }}
                          >
                            {formatCents(price)}
                          </span>
                        )}
                      </div>
                      {p.variants.length > 0 && p.available && (
                        <p
                          className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                          style={{ color: "var(--sf-muted)" }}
                        >
                          a partir de
                        </p>
                      )}
                      {p.description && (
                        <p
                          className="mt-1.5 line-clamp-2 text-sm leading-relaxed"
                          style={{ color: "var(--sf-muted)" }}
                        >
                          {p.description}
                        </p>
                      )}
                      <div className="mt-auto flex justify-end pt-3">
                        {p.available ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition group-hover:text-[color:var(--sf-on-primary)]"
                            style={{
                              background: "var(--sf-accent)",
                              borderColor: "var(--sf-border)",
                              color: "var(--sf-primary)",
                            }}
                          >
                            Adicionar
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            className="inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={{ background: "var(--sf-border)", color: "var(--sf-muted)" }}
                          >
                            Indisponível
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

          </section>
        ))}

        {/* Sobre */}
        {store.store.about && (
          <section className="mt-9">
            <h2 className="text-base font-bold">Sobre a loja</h2>
            <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--sf-muted)" }}>
              {store.store.about}
            </p>
          </section>
        )}

        {/* Entrega */}
        {store.zones.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-1.5 text-base font-bold">
              <MapPin className="h-4 w-4" aria-hidden="true" /> Área de entrega
            </h2>
            <ul className="mt-2 space-y-2">
              {store.zones.map((z) => (
                <li
                  key={z.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
                  style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
                >
                  <span className="min-w-0">
                    <span className="font-semibold">{z.name}</span>
                    {z.bairros && z.bairros.length > 0 && (
                      <span className="block text-xs" style={{ color: "var(--sf-muted)" }}>
                        {z.bairros.join(", ")}
                      </span>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="font-semibold" style={{ color: "var(--sf-primary)" }}>
                      {z.fee_amount === 0 ? "Grátis" : formatCents(z.fee_amount)}
                    </span>
                    {z.eta_minutes && (
                      <span className="block text-xs" style={{ color: "var(--sf-muted)" }}>
                        ~{z.eta_minutes} min
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Horários */}
        <section className="mt-10">
          <div
            className="relative overflow-hidden rounded-[2rem] p-6 sm:p-8"
            style={{ background: "var(--sf-ink)", color: "var(--sf-on-ink)" }}
          >
            <Clock
              className="pointer-events-none absolute -right-4 -top-4 h-32 w-32 opacity-10"
              aria-hidden="true"
            />
            <h2
              className="mb-5 text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--sf-primary)", fontFamily: "var(--sf-font-head)" }}
            >
              Horário de atendimento
            </h2>
            <ul className="relative z-10 space-y-3 text-sm">
              {hours.map((h, index) => (
                <li
                  key={h.weekday}
                  className={`flex items-center justify-between gap-3 ${
                    index < hours.length - 1 ? "border-b pb-2.5" : ""
                  }`}
                  style={{ borderColor: "rgba(255,255,255,.12)" }}
                >
                  <span style={{ color: "var(--sf-ink-muted)" }}>{h.label}</span>
                  <span className="font-bold tabular-nums" style={{ fontFamily: "var(--sf-font-head)" }}>
                    {h.periods.length > 0 ? h.periods.join(" · ") : "Fechado"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>


        <footer className="mt-10 pb-6 text-center text-xs" style={{ color: "var(--sf-muted)" }}>
          Cardápio digital por 360°FOOD
        </footer>
      </main>

      {/* Barra do carrinho */}
      {store.store.online_cart_enabled && count > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 px-4">
          <div className="mx-auto max-w-lg space-y-2">
            {missingToMin > 0 && (
              <p
                className="mx-auto w-fit rounded-full px-3 py-1 text-center text-xs shadow-sm"
                style={{ background: "var(--sf-surface)", color: "var(--sf-muted)" }}
              >
                Faltam <strong style={{ color: "var(--sf-primary)" }}>{formatCents(missingToMin)}</strong> para o
                pedido mínimo
              </p>
            )}
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl p-4 text-left transition hover:scale-[1.01]"
              style={{
                background: "var(--sf-primary)",
                color: "var(--sf-on-primary)",
                boxShadow: "0 18px 40px -12px rgba(0,0,0,.45)",
              }}
            >
              <span className="flex items-center gap-3">
                <span className="relative rounded-xl bg-white/20 p-2.5">
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shadow"
                    style={{ background: "var(--sf-on-primary)", color: "var(--sf-primary)" }}
                  >
                    {count}
                  </span>
                </span>
                <span>
                  <span className="block text-base font-bold" style={{ fontFamily: "var(--sf-font-head)" }}>
                    Ver carrinho
                  </span>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
                    {count} {count === 1 ? "item selecionado" : "itens selecionados"}
                  </span>
                </span>
              </span>
              <span className="text-right">
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">Total</span>
                <span className="block text-xl font-bold tabular-nums" style={{ fontFamily: "var(--sf-font-head)" }}>
                  {formatCents(subtotal)}
                </span>
              </span>
            </button>
          </div>
        </div>

      )}

      <StorefrontProductSheet
        slug={store.store.slug}
        product={product}
        open={productOpen}
        onOpenChange={setProductOpen}
        onAdd={addItem}
      />

      <StorefrontCheckoutSheet
        data={store}
        items={items}
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onChangeQuantity={changeQuantity}
        onRemove={(key) => setItems((prev) => prev.filter((i) => i.key !== key))}
        onPlaced={onPlaced}
      />
    </div>
  );
}

/** Bloco compacto de informação de confiança no topo da loja. */
function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="flex flex-col items-center rounded-2xl border px-2.5 py-3 text-center"
      style={{ borderColor: "var(--sf-border)", background: "var(--sf-accent)" }}
    >
      <span className="mb-1" style={{ color: "var(--sf-primary)" }} aria-hidden="true">
        {icon}
      </span>
      <p
        className="text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--sf-muted)" }}
      >
        {label}
      </p>
      <p className="mt-0.5 w-full truncate text-xs font-semibold" title={value}>
        {value}
      </p>
    </div>
  );
}


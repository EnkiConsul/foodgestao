import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Clock, Loader2, MapPin, MessageCircle, Receipt, ShoppingBag, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  type PublicProduct,
  type PublicStorefront,
} from "@/lib/orders/storefront";
import { PUBLIC_SITE_ORIGIN } from "@/lib/siteOrigin";

export default function LojaOnline() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = usePublicStorefront(slug);

  const [items, setItems] = useState<CartItem[]>([]);
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ number: number; phone: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const store = data && data.found ? (data as PublicStorefront) : null;

  const addItem = (item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.key === item.key);
      if (existing) {
        return prev.map((i) => (i.key === item.key ? { ...i, quantity: Math.min(50, i.quantity + item.quantity) } : i));
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

  const open = store ? isStorefrontOpen(store) : false;
  const nextOpening = store ? nextOpeningLabel(store) : null;
  const hours = useMemo(() => (store ? groupHoursByWeekday(store.hours) : []), [store]);

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
  const description =
    store.store.headline?.trim() ||
    store.store.about?.trim()?.slice(0, 150) ||
    `Cardápio online de ${store.unit.name}. Faça seu pedido para entrega ou retirada.`;

  return (
    <div className="min-h-screen pb-28" style={{ ...themeStyle(store.store.theme, store.store.primary_color), background: "var(--sf-bg)", color: "var(--sf-text)" }}>
      <Helmet>
        <title>{`${store.unit.name} — Cardápio online`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${PUBLIC_SITE_ORIGIN}/c/${store.store.slug}`} />
        <meta property="og:title" content={`${store.unit.name} — Cardápio online`} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${PUBLIC_SITE_ORIGIN}/c/${store.store.slug}`} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Restaurant",
            name: store.unit.name,
            url: `${PUBLIC_SITE_ORIGIN}/c/${store.store.slug}`,
            servesCuisine: "Comida",
            telephone: store.store.whatsapp_phone ?? undefined,
            hasMenu: {
              "@type": "Menu",
              hasMenuSection: store.categories.map((c) => ({
                "@type": "MenuSection",
                name: c.name,
                hasMenuItem: c.products.map((p) => ({
                  "@type": "MenuItem",
                  name: p.name,
                  description: p.description ?? undefined,
                  offers: { "@type": "Offer", price: (p.price_cents / 100).toFixed(2), priceCurrency: "BRL" },
                })),
              })),
            },
          })}
        </script>
      </Helmet>

      {/* Capa */}
      <header>
        <div className="relative h-32 w-full overflow-hidden sm:h-44" style={{ background: "var(--sf-primary)" }}>
          {banner && <img src={banner} alt="" loading="eager" className="absolute inset-0 h-full w-full object-cover" />}
        </div>
        <div className="relative z-10 mx-auto -mt-8 max-w-3xl px-4">

          <div
            className="flex items-start gap-3 rounded-xl border p-3 shadow-sm"
            style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
          >
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
              style={{ borderColor: "var(--sf-border)", background: "var(--sf-bg)" }}
            >
              {logo ? (
                <img src={logo} alt={`Logo de ${store.unit.name}`} className="h-full w-full object-cover" />
              ) : (
                <Store className="h-7 w-7" style={{ color: "var(--sf-muted)" }} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">{store.unit.name}</h1>
              {store.store.headline && (
                <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
                  {store.store.headline}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className="rounded-full px-2 py-0.5 font-medium"
                  style={
                    open
                      ? { background: "var(--sf-primary)", color: "var(--sf-on-primary)" }
                      : { background: "var(--sf-border)", color: "var(--sf-text)" }
                  }
                >
                  {open ? "Aberto agora" : "Fechado"}
                </span>
                {!open && nextOpening && <span style={{ color: "var(--sf-muted)" }}>{nextOpening}</span>}
                <span className="inline-flex items-center gap-1" style={{ color: "var(--sf-muted)" }}>
                  <Clock className="h-3.5 w-3.5" /> {store.unit.prep_time_minutes} min
                </span>
                {store.zones.length > 0 && (
                  <span className="inline-flex items-center gap-1" style={{ color: "var(--sf-muted)" }}>
                    <MapPin className="h-3.5 w-3.5" /> entrega de {formatCents(Math.min(...store.zones.map((z) => z.fee_amount)))}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {store.store.about && (
          <p className="mt-4 text-sm" style={{ color: "var(--sf-muted)" }}>
            {store.store.about}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
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

        {/* Navegação por categorias */}
        {store.categories.length > 1 && (
          <nav
            className="sticky top-0 z-10 -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 py-2"
            style={{ background: "var(--sf-bg)" }}
            aria-label="Categorias do cardápio"
          >
            {store.categories.map((c) => (
              <a
                key={c.id}
                href={`#cat-${c.id}`}
                onClick={() => setActiveCategory(c.id)}
                className="whitespace-nowrap rounded-full border px-3 py-1.5 text-sm"
                style={
                  activeCategory === c.id
                    ? { background: "var(--sf-primary)", color: "var(--sf-on-primary)", borderColor: "var(--sf-primary)" }
                    : { borderColor: "var(--sf-border)" }
                }
              >
                {c.name}
              </a>
            ))}
          </nav>
        )}

        {/* Cardápio */}
        {store.categories.length === 0 && (
          <p className="mt-8 text-center text-sm" style={{ color: "var(--sf-muted)" }}>
            O cardápio desta loja ainda está sendo montado.
          </p>
        )}

        {store.categories.map((category) => (
          <section key={category.id} id={`cat-${category.id}`} className="mt-6 scroll-mt-16">
            <h2 className="text-base font-bold">{category.name}</h2>
            {category.description && (
              <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
                {category.description}
              </p>
            )}
            <div className="mt-3 space-y-2">
              {category.products.map((p) => {
                const image = storefrontMediaUrl(store.store.slug, "ped-produtos", p.image_path);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!p.available}
                    onClick={() => {
                      setProduct(p);
                      setProductOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50"
                    style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      {p.description && (
                        <p className="line-clamp-2 text-xs" style={{ color: "var(--sf-muted)" }}>
                          {p.description}
                        </p>
                      )}
                      <p className="mt-1 text-sm font-semibold" style={{ color: "var(--sf-primary)" }}>
                        {p.available ? formatCents(p.price_cents) : "Indisponível"}
                      </p>
                    </div>
                    {image && (
                      <img
                        src={image}
                        alt={p.name}
                        loading="lazy"
                        className="h-20 w-20 shrink-0 rounded-lg object-cover"
                      />
                    )}
                  </button>
                );
              })}
              {category.products.length === 0 && (
                <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
                  Nenhum item nesta categoria.
                </p>
              )}
            </div>
          </section>
        ))}

        {/* Horários */}
        <section className="mt-8">
          <h2 className="text-base font-bold">Horário de atendimento</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {hours.map((h) => (
              <li key={h.weekday} className="flex justify-between gap-2">
                <span style={{ color: "var(--sf-muted)" }}>{h.label}</span>
                <span>{h.periods.length > 0 ? h.periods.join(" · ") : "Fechado"}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-10 pb-6 text-center text-xs" style={{ color: "var(--sf-muted)" }}>
          Cardápio digital por 360°FOOD
        </footer>
      </main>

      {/* Barra do carrinho */}
      {store.store.online_cart_enabled && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t p-3" style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}>
          <div className="mx-auto max-w-3xl">
            <Button
              className="h-12 w-full justify-between border-0 text-base"
              style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
              onClick={() => setCheckoutOpen(true)}
            >
              <span className="inline-flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" /> Ver carrinho ({count})
              </span>
              <span>{formatCents(cartSubtotal(items))}</span>
            </Button>
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

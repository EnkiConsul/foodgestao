import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  QrCode,
  Save,
  Trash2,
  UtensilsCrossed,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useRemoveStorefrontMedia,
  useSaveStorefront,
  useSlugAvailability,
  useStorefront,
  useStorefrontMediaPreview,
  useUploadStorefrontMedia,
} from "@/hooks/useStorefront";
import { useStorefrontCatalogPreview } from "@/hooks/useStorefrontCatalogPreview";
import { useLogoPalette } from "@/hooks/useLogoPalette";
import type { OrdersUnit } from "@/hooks/useOrdersUnits";

import {
  STOREFRONT_THEMES,
  THEME_TOKENS,
  formatCents,
  isValidSlug,
  onlyDigits,
  slugify,
  storefrontPublicUrl,
  validateStorefront,
  type StorefrontTheme,
} from "@/lib/orders/storefront";

const COLOR_PRESETS = ["#EB6119", "#0F1B3D", "#16A34A", "#DC2626", "#7C3AED", "#0891B2"];

/** Itens que a loja pública vai exibir — vem do cardápio já cadastrado. */
function CatalogPreview({ unit }: { unit: OrdersUnit }) {
  const { data, isLoading } = useStorefrontCatalogPreview(unit.id);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Itens do cardápio</p>
          <p className="text-xs text-muted-foreground">
            {data?.menuName
              ? `Cardápio "${data.menuName}" · unidade ${unit.nome}`
              : `Unidade ${unit.nome}`}
          </p>
        </div>
        <Badge variant={data && data.totalProducts > 0 ? "default" : "secondary"}>
          {data ? `${data.totalProducts} ${data.totalProducts === 1 ? "item" : "itens"}` : "—"}
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      ) : !data || data.totalProducts === 0 ? (
        <div className="space-y-2 rounded-md bg-muted/40 p-3 text-center">
          <UtensilsCrossed className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Nenhum item no cardápio desta empresa</p>
          <p className="text-xs text-muted-foreground">
            A página pública mostra automaticamente os produtos cadastrados nesta empresa. Cadastre
            categorias e produtos para eles aparecerem aqui.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/pedidos/cardapio">Cadastrar cardápio</Link>
          </Button>
        </div>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {data.categories.map((cat) => (
            <div key={cat.id} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{cat.name}</p>
              <ul className="space-y-1">
                {cat.products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {!p.available && (
                        <Badge variant="secondary" className="text-[10px]">
                          Indisponível
                        </Badge>
                      )}
                      <span className="tabular-nums text-muted-foreground">
                        {formatCents(p.base_price_cents)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Produtos cadastrados em outra empresa não aparecem nesta loja.
      </p>
    </div>
  );
}


function MediaField({
  label,
  hint,
  path,
  unitId,
  kind,
  aspect,
  slug,
}: {
  label: string;
  hint: string;
  path: string | null;
  unitId: string;
  kind: "logo" | "banner";
  aspect: string;
  slug: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadStorefrontMedia();
  const remove = useRemoveStorefrontMedia();
  const { data: preview } = useStorefrontMediaPreview(path);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className={`relative overflow-hidden rounded-lg border bg-muted/40 ${aspect}`}>
        {preview ? (
          <img src={preview} alt={label} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
        {upload.isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="mr-2 h-3.5 w-3.5" /> Enviar imagem
        </Button>
        {path && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ unitId, kind, path })}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Remover
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate({ unitId, kind, file, slug });
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function StepCardapioOnline({ unit, onSaved }: { unit: OrdersUnit; onSaved: () => void }) {
  const { data: store, isLoading } = useStorefront(unit.id);
  const save = useSaveStorefront();

  const [slug, setSlug] = useState("");
  const [theme, setTheme] = useState<StorefrontTheme>("classic");
  const [color, setColor] = useState("#EB6119");
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cart, setCart] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (store) {
      setSlug(store.slug);
      setTheme(store.theme);
      setColor(store.primary_color);
      setHeadline(store.headline ?? "");
      setAbout(store.about ?? "");
      setWhatsapp(store.whatsapp_phone ?? "");
      setCart(store.online_cart_enabled);
    } else if (!touched) {
      setSlug(slugify(unit.nome));
      setWhatsapp(unit.telefone ?? "");
    }
  }, [store, unit.nome, unit.telefone, touched]);

  const published = Boolean(store?.is_published);
  const { data: logoPreview } = useStorefrontMediaPreview(store?.logo_url ?? null);
  const { data: logoPalette = [] } = useLogoPalette(logoPreview ?? null);
  const publicUrl = useMemo(() => (slug ? storefrontPublicUrl(slug) : ""), [slug]);

  const slugChanged = !store || store.slug !== slug.trim().toLowerCase();
  const { data: available, isFetching: checkingSlug } = useSlugAvailability(
    slugChanged && isValidSlug(slug) ? slug.trim().toLowerCase() : "",
    unit.id,
  );

  const { data: catalog } = useStorefrontCatalogPreview(unit.id);
  const catalogEmpty = Boolean(catalog && catalog.totalProducts === 0);



  useEffect(() => {
    if (!published || !publicUrl) {
      setQr(null);
      return;
    }
    let active = true;
    QRCode.toDataURL(publicUrl, { width: 512, margin: 1 })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => setQr(null));
    return () => {
      active = false;
    };
  }, [published, publicUrl]);

  const persist = (publish?: boolean) => {
    const found = validateStorefront({ slug, primary_color: color, theme, headline, about, whatsapp_phone: whatsapp });
    if (slugChanged && available === false) found.push("Este link já está em uso. Escolha outro.");
    if (publish && !cart && !onlyDigits(whatsapp)) {
      found.push("Sem carrinho online, informe o WhatsApp para receber os pedidos.");
    }
    setErrors(found);
    if (found.length > 0) return;

    save.mutate(
      {
        unitId: unit.id,
        slug,
        theme,
        primary_color: color,
        headline: headline.trim() || null,
        about: about.trim() || null,
        whatsapp_phone: onlyDigits(whatsapp) || null,
        online_cart_enabled: cart,
        ...(publish === undefined ? {} : { is_published: publish }),
      },
      { onSuccess: () => publish !== false && onSaved() },
    );
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  };

  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `qrcode-${slug}.png`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Alert>
        <AlertDescription className="text-xs">
          Criamos uma página de cardápio própria com seu link. Os produtos, categorias e complementos já
          cadastrados aparecem automaticamente — nada é duplicado aqui.
        </AlertDescription>
      </Alert>

      <CatalogPreview unit={unit} />

      {catalogEmpty && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Sua loja será publicada sem itens até você cadastrar produtos no cardápio.
          </AlertDescription>
        </Alert>
      )}



      {/* Link da loja */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-slug">
          Link da sua loja <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-1 rounded-md border px-2 focus-within:ring-1 focus-within:ring-ring">
          <span className="shrink-0 text-xs text-muted-foreground">/c/</span>
          <Input
            id="sf-slug"
            value={slug}
            onChange={(e) => {
              setTouched(true);
              setSlug(slugify(e.target.value));
            }}
            className="border-0 px-1 shadow-none focus-visible:ring-0"
            placeholder="minha-hamburgueria"
            maxLength={40}
          />
          {slugChanged && isValidSlug(slug) && (
            <span className="shrink-0 text-xs">
              {checkingSlug ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : available ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Check className="h-3.5 w-3.5" /> livre
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <X className="h-3.5 w-3.5" /> em uso
                </span>
              )}
            </span>
          )}
        </div>
        {publicUrl && <p className="break-all text-xs text-muted-foreground">{publicUrl}</p>}
      </div>

      {/* Tema */}
      <div className="space-y-2">
        <Label>
          Tema <span className="text-destructive">*</span>
        </Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {STOREFRONT_THEMES.map((t) => {
            const tokens = THEME_TOKENS[t];
            const active = theme === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                  active ? "border-primary ring-1 ring-primary" : "hover:bg-accent"
                }`}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
                  style={{ background: tokens.bg, borderColor: tokens.border }}
                >
                  <span className="h-4 w-4 rounded-full" style={{ background: color }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{tokens.label}</span>
                  <span className="block text-xs text-muted-foreground">{tokens.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cor */}
      <div className="space-y-2">
        <Label>
          Cor principal <span className="text-destructive">*</span>
        </Label>
        {logoPalette.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Cores da sua logo</p>
            <div className="flex flex-wrap items-center gap-2">
              {logoPalette.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Usar cor da logo ${c}`}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 ${color.toLowerCase() === c.toLowerCase() ? "border-foreground" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {logoPalette.length > 0 && (
            <span className="w-full text-xs text-muted-foreground">Sugestões</span>
          )}
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Usar cor ${c}`}
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full border-2 ${color.toLowerCase() === c.toLowerCase() ? "border-foreground" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
          <Input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-14 p-1"
            aria-label="Cor personalizada"
          />
        </div>
      </div>


      {/* Imagens */}
      <div className="grid gap-4 sm:grid-cols-2">
        <MediaField
          label="Logo"
          hint="Quadrada, 512×512 px. PNG, JPG ou WEBP até 3 MB."
          path={store?.logo_url ?? null}
          unitId={unit.id}
          kind="logo"
          slug={slug}
          aspect="aspect-square max-w-[160px]"
        />
        <MediaField
          label="Banner"
          hint="Formato largo, 1600×480 px (10:3). PNG, JPG ou WEBP até 3 MB."
          path={store?.banner_url ?? null}
          unitId={unit.id}
          kind="banner"
          slug={slug}
          aspect="aspect-[3/1]"
        />
      </div>

      {/* Textos */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-headline">Frase de destaque</Label>
        <Input
          id="sf-headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={120}
          placeholder="O melhor hambúrguer artesanal da cidade"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-about">Sobre a loja</Label>
        <Textarea
          id="sf-about"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="Conte em poucas linhas o que sua loja oferece."
        />
        <p className="text-xs text-muted-foreground">{about.length}/600</p>
      </div>

      {/* Recebimento do pedido */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Carrinho online</p>
            <p className="text-xs text-muted-foreground">
              O cliente fecha o pedido na página e ele cai direto na central de pedidos.
            </p>
          </div>
          <Switch checked={cart} onCheckedChange={setCart} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sf-wa">WhatsApp para pedidos {!cart && <span className="text-destructive">*</span>}</Label>
          <Input
            id="sf-wa"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="(62) 99999-9999"
            inputMode="tel"
          />
          <p className="text-xs text-muted-foreground">
            Aparece como botão na loja. Com o carrinho desligado, é a única forma de pedir.
          </p>
        </div>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-inside list-disc space-y-1 text-sm">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Publicação */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Publicação</p>
          <Badge variant={published ? "default" : "secondary"}>{published ? "Publicada" : "Não publicada"}</Badge>
        </div>
        {published ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Copiar link
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir loja
                </a>
              </Button>
              {qr && (
                <Button type="button" size="sm" variant="outline" onClick={downloadQr}>
                  <QrCode className="mr-2 h-3.5 w-3.5" /> Baixar QR code
                </Button>
              )}
            </div>
            {qr && (
              <img
                src={qr}
                alt={`QR code da loja ${slug}`}
                className="h-36 w-36 rounded-md border bg-background p-2"
              />
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={save.isPending}
              onClick={() => persist(false)}
            >
              Despublicar loja
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Publique para gerar o link público e o QR code. Você pode despublicar quando quiser.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => persist(undefined)} variant="outline" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar rascunho
        </Button>
        <Button onClick={() => persist(true)} disabled={save.isPending}>
          {published ? "Salvar e continuar" : "Publicar e continuar"}
        </Button>
      </div>
    </div>
  );
}

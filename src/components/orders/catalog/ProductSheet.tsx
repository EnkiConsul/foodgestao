import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ImageOff,
  Loader2,
  Pause,
  Play,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CATALOG_STATES,
  CATALOG_STATE_LABELS,
  WEEKDAY_LABELS,
  centsToInput,
  effectivePriceCents,
  formatCents,
  moveItem,
  parsePriceToCents,
  validateGroupRule,
  type CatalogState,
} from "@/lib/orders/catalog";
import { CHANNEL_LABELS, ORDER_CHANNELS, type OrderChannel } from "@/lib/orders/units";
import {
  useDeleteCatalogRow,
  useOrdersProductDetail,
  useProductImageUrl,
  useRemoveProductImage,
  useReorderCatalog,
  useSaveAvailability,
  useSaveCategory,
  useSaveOption,
  useSaveOptionGroup,
  useSaveProduct,
  useSaveUnitOverride,
  useSaveVariant,
  useUploadProductImage,
  type OrdersProduct,
} from "@/hooks/useOrdersCatalog";
import { useOrdersUnits } from "@/hooks/useOrdersUnits";

interface Props {
  product: OrdersProduct | null;
  categoryId: string | null;
  categories?: { id: string; name: string }[];
  /** Cardápio ativo — habilita o atalho de criar categoria aqui mesmo. */
  menuId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
}


/** Editor completo do produto: dados, imagem, variações, complementos, disponibilidade e preços por unidade. */
export function ProductSheet({ product, categoryId, categories = [], menuId, open, onOpenChange, readOnly }: Props) {
  const isNew = !product;
  const detail = useOrdersProductDetail(product?.id ?? null);
  const { data: units } = useOrdersUnits();
  const saveProduct = useSaveProduct();
  const saveVariant = useSaveVariant();
  const saveGroup = useSaveOptionGroup();
  const saveOption = useSaveOption();
  const saveAvailability = useSaveAvailability();
  const saveOverride = useSaveUnitOverride();
  const removeRow = useDeleteCatalogRow();
  const reorder = useReorderCatalog();
  const uploadImage = useUploadProductImage();
  const removeImage = useRemoveProductImage();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [internalCode, setInternalCode] = useState(product?.internal_code ?? "");
  const [price, setPrice] = useState(centsToInput(product?.base_price_cents ?? 0));
  const [prep, setPrep] = useState(product?.prep_time_minutes ? String(product.prep_time_minutes) : "");
  const [allowsNotes, setAllowsNotes] = useState(product?.allows_notes ?? true);
  const [trackStock, setTrackStock] = useState(product?.track_stock ?? false);
  const [stock, setStock] = useState(product?.stock_quantity ? String(product.stock_quantity) : "0");
  const [state, setState] = useState<CatalogState>(product?.state ?? "draft");
  const [selectedCategory, setSelectedCategory] = useState<string>(
    product?.category_id ?? categoryId ?? "",
  );

  useEffect(() => {
    if (!open) return;
    setSelectedCategory(product?.category_id ?? categoryId ?? "");
  }, [open, product?.category_id, categoryId]);



  const [variantName, setVariantName] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupRequired, setGroupRequired] = useState(false);
  const [groupMin, setGroupMin] = useState("0");
  const [groupMax, setGroupMax] = useState("1");
  const [optionDrafts, setOptionDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const [availUnit, setAvailUnit] = useState<string>("all");
  const [availWeekday, setAvailWeekday] = useState<string>("all");
  const [availStart, setAvailStart] = useState("");
  const [availEnd, setAvailEnd] = useState("");
  const [availChannels, setAvailChannels] = useState<OrderChannel[]>([]);

  const imageQuery = useProductImageUrl(product?.image_path ?? null);
  const basePriceCents = parsePriceToCents(price) ?? 0;

  const previewPrice = useMemo(() => {
    const variant = (detail.data?.variants ?? []).find((v) => v.is_default) ?? detail.data?.variants?.[0];
    return effectivePriceCents({
      basePriceCents,
      variantPriceCents: variant?.price_cents ?? null,
    });
  }, [basePriceCents, detail.data?.variants]);

  const disabled = !!readOnly;

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    const cents = parsePriceToCents(price);
    if (cents === null || cents < 0) {
      toast.error("Informe um preço válido.");
      return;
    }
    const targetCategory = product?.category_id ?? selectedCategory;
    if (!targetCategory) {
      toast.error("Selecione uma categoria. Cadastre uma categoria no cardápio antes de criar produtos.");
      return;
    }
    try {
      await saveProduct.mutateAsync({
        id: product?.id,
        category_id: targetCategory,
        name,
        description,
        internal_code: internalCode,
        base_price_cents: cents,
        prep_time_minutes: prep ? Number(prep) : null,
        allows_notes: allowsNotes,
        track_stock: trackStock,
        stock_quantity: trackStock ? Number(stock || 0) : null,
        state,
      });
      if (isNew) onOpenChange(false);
    } catch {
      /* erro já exibido pelo hook */
    }
  }


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{isNew ? "Novo produto" : product!.name}</SheetTitle>
          <SheetDescription>
            {isNew
              ? "Cadastre o produto e depois configure variações, complementos e disponibilidade."
              : "Preço, disponibilidade e complementos do produto. Pedidos antigos mantêm o preço da época."}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="dados" className="mt-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="variacoes" disabled={isNew}>Variações</TabsTrigger>
            <TabsTrigger value="complementos" disabled={isNew}>Complementos</TabsTrigger>
            <TabsTrigger value="disponibilidade" disabled={isNew}>Disponibilidade</TabsTrigger>
            <TabsTrigger value="preview" disabled={isNew}>Prévia</TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------ dados */}
          <TabsContent value="dados" className="space-y-4 pt-4">
            {isNew && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Categoria *</Label>
                  {menuId && !disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setCreatingCategory((v) => !v)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Nova categoria
                    </Button>
                  )}
                </div>
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma categoria cadastrada neste cardápio. Crie uma agora mesmo em “Nova categoria”.
                  </p>
                ) : (
                  <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={disabled}>
                    <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {menuId && (creatingCategory || categories.length === 0) && !disabled && (
                  <div className="flex items-end gap-2 rounded-md border border-dashed p-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="prod-new-cat" className="text-xs">Nome da nova categoria</Label>
                      <Input
                        id="prod-new-cat"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Ex.: Pizzas"
                        maxLength={80}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleCreateCategory();
                          }
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newCategoryName.trim() || saveCategory.isPending}
                      onClick={() => void handleCreateCategory()}
                    >
                      {saveCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                    </Button>
                  </div>
                )}
              </div>
            )}


            <div className="space-y-2">
              <Label htmlFor="prod-name">Nome *</Label>
              <Input id="prod-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-desc">Descrição</Label>
              <Textarea id="prod-desc" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={disabled} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prod-price">Preço *</Label>
                <Input id="prod-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" inputMode="decimal" disabled={disabled} />
                <p className="text-xs text-muted-foreground">{formatCents(basePriceCents)}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-code">Código interno</Label>
                <Input id="prod-code" value={internalCode ?? ""} onChange={(e) => setInternalCode(e.target.value)} maxLength={40} disabled={disabled} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-prep">Tempo de preparo (min)</Label>
                <Input id="prod-prep" value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, ""))} inputMode="numeric" disabled={disabled} />
              </div>
              <div className="space-y-2">
                <Label>Situação</Label>
                <Select value={state} onValueChange={(v) => setState(v as CatalogState)} disabled={disabled}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATALOG_STATES.filter((s) => s !== "archived").map((s) => (
                      <SelectItem key={s} value={s}>{CATALOG_STATE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Permitir observações do cliente</p>
                <p className="text-xs text-muted-foreground">Ex.: "sem cebola".</p>
              </div>
              <Switch checked={allowsNotes} onCheckedChange={setAllowsNotes} disabled={disabled} />
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Controlar estoque</p>
                  <p className="text-xs text-muted-foreground">Opcional. Zera a disponibilidade quando acabar.</p>
                </div>
                <Switch checked={trackStock} onCheckedChange={setTrackStock} disabled={disabled} />
              </div>
              {trackStock && (
                <Input
                  className="mt-3"
                  value={stock}
                  onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  placeholder="Quantidade"
                  disabled={disabled}
                />
              )}
            </div>

            {!isNew && (
              <div className="space-y-2">
                <Label>Foto do produto</Label>
                <div className="flex items-center gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {imageQuery.data ? (
                      <img src={imageQuery.data} alt={`Foto de ${product!.name}`} className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          uploadImage.mutate({ productId: product!.id, file, previousPath: product!.image_path });
                        }
                        e.target.value = "";
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" disabled={disabled || uploadImage.isPending} onClick={() => fileRef.current?.click()}>
                      {uploadImage.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Enviar foto
                    </Button>
                    {product!.image_path && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() => removeImage.mutate({ productId: product!.id, path: product!.image_path! })}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Remover
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">JPG, PNG, WEBP ou AVIF · até 5 MB.</p>
              </div>
            )}

            <Button onClick={handleSave} disabled={disabled || !name.trim() || saveProduct.isPending} className="w-full">
              {saveProduct.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isNew ? "Criar produto" : "Salvar alterações"}
            </Button>
          </TabsContent>

          {/* -------------------------------------------- variações */}
          <TabsContent value="variacoes" className="space-y-4 pt-4">
            {(detail.data?.variants ?? []).length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Sem variações. O produto usa o preço base.
              </p>
            )}
            <ul className="space-y-2">
              {(detail.data?.variants ?? []).map((v, index, arr) => (
                <li key={v.id} className="flex items-center gap-2 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCents(v.price_cents)}{v.is_default ? " · padrão" : ""}</p>
                  </div>
                  <Button size="icon" variant="ghost" disabled={disabled || index === 0}
                    onClick={() => reorder.mutate({ kind: "variant", ids: moveItem(arr.map((x) => x.id), index, index - 1) })}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={disabled || index === arr.length - 1}
                    onClick={() => reorder.mutate({ kind: "variant", ids: moveItem(arr.map((x) => x.id), index, index + 1) })}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={disabled}
                    onClick={() => removeRow.mutate({ table: "ped_product_variants", id: v.id })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <Separator />
            <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
              <Input placeholder="Nome (ex.: Duplo)" value={variantName} onChange={(e) => setVariantName(e.target.value)} disabled={disabled} />
              <Input placeholder="0,00" value={variantPrice} onChange={(e) => setVariantPrice(e.target.value)} inputMode="decimal" disabled={disabled} />
              <Button
                disabled={disabled || !variantName.trim() || parsePriceToCents(variantPrice) === null}
                onClick={async () => {
                  await saveVariant.mutateAsync({
                    product_id: product!.id,
                    name: variantName,
                    price_cents: parsePriceToCents(variantPrice)!,
                    is_default: (detail.data?.variants ?? []).length === 0,
                  });
                  setVariantName("");
                  setVariantPrice("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>

          {/* ----------------------------------------- complementos */}
          <TabsContent value="complementos" className="space-y-4 pt-4">
            {(detail.data?.groups ?? []).length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nenhum grupo de complementos.
              </p>
            )}
            {(detail.data?.groups ?? []).map((g) => {
              const groupOptions = (detail.data?.options ?? []).filter((o) => o.group_id === g.id);
              const draft = optionDrafts[g.id] ?? { name: "", price: "" };
              return (
                <div key={g.id} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.is_required ? "Obrigatório" : "Opcional"} · mín. {g.min_choices} · máx. {g.max_choices}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" disabled={disabled}
                      onClick={() => removeRow.mutate({ table: "ped_option_groups", id: g.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="space-y-1">
                    {groupOptions.map((o) => (
                      <li key={o.id} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm">{o.name}</span>
                        <span className="text-xs text-muted-foreground">{formatCents(o.price_cents)}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={disabled}
                          onClick={() => removeRow.mutate({ table: "ped_options", id: o.id })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                    <Input
                      placeholder="Complemento"
                      value={draft.name}
                      disabled={disabled}
                      onChange={(e) => setOptionDrafts((p) => ({ ...p, [g.id]: { ...draft, name: e.target.value } }))}
                    />
                    <Input
                      placeholder="0,00"
                      value={draft.price}
                      inputMode="decimal"
                      disabled={disabled}
                      onChange={(e) => setOptionDrafts((p) => ({ ...p, [g.id]: { ...draft, price: e.target.value } }))}
                    />
                    <Button
                      disabled={disabled || !draft.name.trim()}
                      onClick={async () => {
                        await saveOption.mutateAsync({
                          group_id: g.id,
                          name: draft.name,
                          price_cents: parsePriceToCents(draft.price) ?? 0,
                        });
                        setOptionDrafts((p) => ({ ...p, [g.id]: { name: "", price: "" } }));
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

            <Separator />
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Novo grupo</p>
              <Input placeholder="Nome (ex.: Ponto da carne)" value={groupName} onChange={(e) => setGroupName(e.target.value)} disabled={disabled} />
              <div className="flex items-center justify-between">
                <Label htmlFor="grp-req" className="text-sm">Obrigatório</Label>
                <Switch id="grp-req" checked={groupRequired} onCheckedChange={(v) => {
                  setGroupRequired(v);
                  if (v && Number(groupMin) < 1) setGroupMin("1");
                }} disabled={disabled} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Mínimo</Label>
                  <Input value={groupMin} onChange={(e) => setGroupMin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" disabled={disabled} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Máximo</Label>
                  <Input value={groupMax} onChange={(e) => setGroupMax(e.target.value.replace(/\D/g, ""))} inputMode="numeric" disabled={disabled} />
                </div>
              </div>
              {(() => {
                const problem = validateGroupRule({
                  is_required: groupRequired,
                  min_choices: Number(groupMin || 0),
                  max_choices: Number(groupMax || 0),
                });
                return (
                  <>
                    {problem && <p className="text-xs text-destructive">{problem}</p>}
                    <Button
                      className="w-full"
                      disabled={disabled || !groupName.trim() || !!problem}
                      onClick={async () => {
                        await saveGroup.mutateAsync({
                          product_id: product!.id,
                          name: groupName,
                          is_required: groupRequired,
                          min_choices: Number(groupMin || 0),
                          max_choices: Number(groupMax || 1),
                        });
                        setGroupName("");
                        setGroupRequired(false);
                        setGroupMin("0");
                        setGroupMax("1");
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Adicionar grupo
                    </Button>
                  </>
                );
              })()}
            </div>
          </TabsContent>

          {/* ------------------------------------ disponibilidade */}
          <TabsContent value="disponibilidade" className="space-y-4 pt-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Janelas cadastradas</p>
              {(detail.data?.availability ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Sem restrições: disponível sempre que a unidade estiver aberta.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(detail.data?.availability ?? []).map((a) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          {a.weekday === null ? "Todos os dias" : WEEKDAY_LABELS[a.weekday]}
                          {a.starts_at && a.ends_at ? ` · ${a.starts_at.slice(0, 5)}–${a.ends_at.slice(0, 5)}` : " · dia inteiro"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.unit_id ? (units ?? []).find((u) => u.id === a.unit_id)?.nome ?? "Unidade" : "Todas as unidades"}
                          {a.channels.length > 0 ? ` · ${a.channels.map((c) => CHANNEL_LABELS[c]).join(", ")}` : ""}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" disabled={disabled}
                        onClick={() => removeRow.mutate({ table: "ped_product_availability", id: a.id })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Nova janela</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={availUnit} onValueChange={setAvailUnit} disabled={disabled}>
                  <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as unidades</SelectItem>
                    {(units ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={availWeekday} onValueChange={setAvailWeekday} disabled={disabled}>
                  <SelectTrigger><SelectValue placeholder="Dia" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os dias</SelectItem>
                    {WEEKDAY_LABELS.map((label, i) => <SelectItem key={label} value={String(i)}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="time" value={availStart} onChange={(e) => setAvailStart(e.target.value)} disabled={disabled} />
                <Input type="time" value={availEnd} onChange={(e) => setAvailEnd(e.target.value)} disabled={disabled} />
              </div>
              <div className="flex flex-wrap gap-2">
                {ORDER_CHANNELS.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={availChannels.includes(c) ? "default" : "outline"}
                    disabled={disabled}
                    onClick={() =>
                      setAvailChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
                    }
                  >
                    {CHANNEL_LABELS[c]}
                  </Button>
                ))}
              </div>
              <Button
                className="w-full"
                disabled={disabled || (!!availStart !== !!availEnd) || (!!availStart && availEnd <= availStart)}
                onClick={async () => {
                  await saveAvailability.mutateAsync({
                    product_id: product!.id,
                    unit_id: availUnit === "all" ? null : availUnit,
                    channels: availChannels,
                    weekday: availWeekday === "all" ? null : Number(availWeekday),
                    starts_at: availStart || null,
                    ends_at: availEnd || null,
                  });
                  setAvailStart("");
                  setAvailEnd("");
                  setAvailChannels([]);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Adicionar janela
              </Button>
            </div>

            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium">Preço e pausa por unidade</p>
              {(units ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>
              )}
              {(units ?? []).map((u) => {
                const ov = (detail.data?.overrides ?? []).find((o) => o.unit_id === u.id);
                return (
                  <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                    <span className="min-w-0 flex-1 truncate text-sm">{u.nome}</span>
                    <Input
                      className="w-28"
                      placeholder={centsToInput(basePriceCents)}
                      defaultValue={ov?.price_cents != null ? centsToInput(ov.price_cents) : ""}
                      inputMode="decimal"
                      disabled={disabled}
                      onBlur={(e) => {
                        const cents = e.target.value.trim() ? parsePriceToCents(e.target.value) : null;
                        if (e.target.value.trim() && cents === null) return;
                        saveOverride.mutate({
                          product_id: product!.id,
                          unit_id: u.id,
                          price_cents: cents,
                          state: ov?.state ?? null,
                        });
                      }}
                    />
                    <Button
                      size="sm"
                      variant={ov?.state === "paused" ? "secondary" : "outline"}
                      disabled={disabled}
                      onClick={() =>
                        saveOverride.mutate({
                          product_id: product!.id,
                          unit_id: u.id,
                          price_cents: ov?.price_cents ?? null,
                          state: ov?.state === "paused" ? null : "paused",
                        })
                      }
                    >
                      {ov?.state === "paused" ? <Play className="mr-1 h-3.5 w-3.5" /> : <Pause className="mr-1 h-3.5 w-3.5" />}
                      {ov?.state === "paused" ? "Reativar" : "Pausar"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* --------------------------------------------- prévia */}
          <TabsContent value="preview" className="pt-4">
            <div className="overflow-hidden rounded-xl border">
              {imageQuery.data && (
                <img src={imageQuery.data} alt={`Prévia de ${name}`} className="h-40 w-full object-cover" />
              )}
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{name || "Produto"}</h3>
                    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
                  </div>
                  <Badge variant="outline">{CATALOG_STATE_LABELS[state]}</Badge>
                </div>
                <p className="text-lg font-bold text-primary">{formatCents(previewPrice)}</p>
                {(detail.data?.groups ?? []).map((g) => (
                  <div key={g.id}>
                    <p className="text-sm font-medium">
                      {g.name}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {g.is_required ? "(obrigatório)" : "(opcional)"} · até {g.max_choices}
                      </span>
                    </p>
                    <ul className="mt-1 space-y-1">
                      {(detail.data?.options ?? []).filter((o) => o.group_id === g.id).map((o) => (
                        <li key={o.id} className="flex justify-between text-sm text-muted-foreground">
                          <span>{o.name}</span>
                          <span>{o.price_cents === 0 ? "grátis" : formatCents(o.price_cents)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {allowsNotes && <p className="text-xs text-muted-foreground">Cliente pode enviar observações.</p>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export { Copy as CopyIcon };

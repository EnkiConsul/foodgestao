import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ImageOff,
  Archive,
  Pause,
  Play,
  Plus,
  Search,
  UtensilsCrossed,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrdersGuard } from "@/components/orders/OrdersGuard";
import { OrdersPageHeader } from "@/components/orders/OrdersPageHeader";
import { HelpHint } from "@/components/common/HelpHint";
import { ProductSheet } from "@/components/orders/catalog/ProductSheet";
import {
  CATALOG_STATE_LABELS,
  CATALOG_STATE_VARIANTS,
  formatCents,
  moveItem,
  resolveAvailability,
  UNAVAILABLE_LABELS,
  type CatalogState,
} from "@/lib/orders/catalog";
import {
  useArchiveProduct,
  useDuplicateMenuToUnit,
  useDuplicateProduct,
  useOrdersCategories,
  useOrdersMenus,
  useOrdersProducts,
  useReorderCatalog,
  useSaveCategory,
  useSaveMenu,
  useToggleProductPause,
  type OrdersProduct,
} from "@/hooks/useOrdersCatalog";
import { useOrdersEntitlement } from "@/hooks/useOrdersEntitlement";
import { useOrdersUnits } from "@/hooks/useOrdersUnits";


const HELP = {
  pageTitle: "Monte o cardápio: crie categorias, cadastre produtos e defina preço e disponibilidade.",
  cardapio: "Conjunto de categorias e produtos oferecidos. Pode haver mais de um por unidade.",
  categoria: "Agrupa produtos parecidos, ex.: Bebidas, Lanches. Organiza a exibição no cardápio.",
  produto: "Item vendido: nome, preço, foto, variações e complementos.",
  disponibilidade: "Indica se o produto está disponível, pausado ou fora de estoque para venda agora.",
  preco: "Valor de venda do produto exibido ao cliente no momento do pedido.",
} as const;

function CatalogContent() {
  const { entitlement } = useOrdersEntitlement("orders.catalog");
  const readOnly = entitlement.read_only;

  const { data: menus, isLoading: loadingMenus } = useOrdersMenus();
  const { data: units } = useOrdersUnits();
  const [menuId, setMenuId] = useState<string | null>(null);
  const activeMenuId = menuId ?? menus?.[0]?.id ?? null;
  const activeMenu = (menus ?? []).find((m) => m.id === activeMenuId) ?? null;

  const { data: categories } = useOrdersCategories(activeMenuId);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { data: products } = useOrdersProducts(activeMenuId, categoryFilter === "all" ? null : categoryFilter);

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<CatalogState | "all" | "not_archived">("not_archived");
  const [newMenuName, setNewMenuName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [sheetProduct, setSheetProduct] = useState<OrdersProduct | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<OrdersProduct | null>(null);
  const [dupUnitId, setDupUnitId] = useState<string>("");

  const saveMenu = useSaveMenu();
  const saveCategory = useSaveCategory();
  const duplicateMenu = useDuplicateMenuToUnit();
  const duplicateProduct = useDuplicateProduct();
  const togglePause = useToggleProductPause();
  const archiveProduct = useArchiveProduct();
  const reorder = useReorderCatalog();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (stateFilter === "not_archived" && p.state === "archived") return false;
      if (stateFilter !== "all" && stateFilter !== "not_archived" && p.state !== stateFilter) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        (p.internal_code ?? "").toLowerCase().includes(term) ||
        (p.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [products, search, stateFilter]);

  const grouped = useMemo(() => {
    return (categories ?? [])
      .map((c) => ({ category: c, items: filtered.filter((p) => p.category_id === c.id) }))
      .filter((g) => categoryFilter === "all" || g.category.id === categoryFilter);
  }, [categories, filtered, categoryFilter]);

  if (loadingMenus) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <Helmet>
        <title>Cardápio | Pedidos 360°FOOD</title>
        <meta name="description" content="Monte o cardápio do módulo Pedidos: categorias, produtos, variações, complementos e disponibilidade por unidade." />
      </Helmet>

      <OrdersPageHeader
        backTo="/pedidos"
        backLabel="Voltar ao módulo Pedidos"
        title="Cardápio"
        icon={<UtensilsCrossed className="h-6 w-6 text-primary" aria-hidden="true" />}
        subtitle={
          <span className="inline-flex items-center gap-1">
            Categorias, produtos, variações e disponibilidade por unidade.
            <HelpHint text={HELP.pageTitle} />
          </span>
        }
        actions={
          !readOnly && (menus ?? []).length > 0 ? (
            <Button
              className="min-h-10 md:min-h-11"
              disabled={!activeMenuId}
              onClick={() => { setSheetProduct(null); setSheetOpen(true); }}
            >
              <Plus className="h-4 w-4 md:mr-2" aria-hidden="true" />
              <span className="hidden md:inline">Novo produto</span>
            </Button>
          ) : undefined
        }
      />

      {(menus ?? []).length === 0 ? (
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <UtensilsCrossed className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Nenhum cardápio ainda</h2>
              <p className="text-sm text-muted-foreground">Crie o primeiro cardápio para começar a cadastrar produtos.</p>
            </div>
            <div className="mx-auto flex max-w-sm gap-2">
              <Input placeholder="Nome do cardápio" value={newMenuName} onChange={(e) => setNewMenuName(e.target.value)} disabled={readOnly} />
              <Button
                disabled={readOnly || !newMenuName.trim() || saveMenu.isPending}
                onClick={async () => {
                  const id = await saveMenu.mutateAsync({ name: newMenuName, state: "active", is_default: true });
                  setNewMenuName("");
                  setMenuId(id);
                }}
              >
                Criar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* seletor de cardápio + duplicação entre unidades */}
          <Card className="mb-4">
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              <HelpHint text={HELP.cardapio} className="shrink-0" />
              <Select value={activeMenuId ?? ""} onValueChange={(v) => { setMenuId(v); setCategoryFilter("all"); }}>
                <SelectTrigger className="min-h-11 w-full sm:w-64"><SelectValue placeholder="Cardápio" /></SelectTrigger>
                <SelectContent>
                  {(menus ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                      {m.unit_id ? ` · ${(units ?? []).find((u) => u.id === m.unit_id)?.nome ?? "unidade"}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeMenu && (
                <Badge variant={CATALOG_STATE_VARIANTS[activeMenu.state]}>{CATALOG_STATE_LABELS[activeMenu.state]}</Badge>
              )}
              <div className="grid w-full gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                <Select value={dupUnitId} onValueChange={setDupUnitId}>
                  <SelectTrigger className="min-h-11 w-full sm:w-44"><SelectValue placeholder="Duplicar para..." /></SelectTrigger>
                  <SelectContent>
                    {(units ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={readOnly || !dupUnitId || !activeMenuId || duplicateMenu.isPending}
                  onClick={async () => {
                    const id = await duplicateMenu.mutateAsync({ menuId: activeMenuId!, targetUnitId: dupUnitId });
                    setDupUnitId("");
                    setMenuId(id);
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Duplicar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* busca e filtros */}
          <div className="mb-4 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="min-h-11 pl-9" placeholder="Buscar produto ou código" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full min-h-11 sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {(categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as typeof stateFilter)}>
              <SelectTrigger className="w-full min-h-11 sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="not_archived">Ativos e rascunhos</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Disponíveis</SelectItem>
                <SelectItem value="paused">Pausados</SelectItem>
                <SelectItem value="draft">Rascunhos</SelectItem>
                <SelectItem value="archived">Arquivados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* criação rápida de categoria */}
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Nova categoria</span>
            <HelpHint text={HELP.categoria} />
          </div>
          <div className="mb-4 flex gap-2">
            <Input className="min-h-11" placeholder="Nova categoria (ex.: Hambúrgueres)" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} disabled={readOnly} />
            <Button
              variant="outline"
              className="min-h-11 shrink-0"
              disabled={readOnly || !newCategoryName.trim() || !activeMenuId}
              onClick={async () => {
                await saveCategory.mutateAsync({ menu_id: activeMenuId!, name: newCategoryName });
                setNewCategoryName("");
              }}
            >
              <Plus className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Categoria</span>
            </Button>
          </div>

          {grouped.length === 0 && (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma categoria neste cardápio. Crie a primeira acima.
            </CardContent></Card>
          )}

          <div className="space-y-4">
            {grouped.map(({ category, items }, catIndex) => (
              <Card key={category.id}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <h2 className="min-w-0 flex-1 truncate font-semibold">{category.name}</h2>
                    <HelpHint text={HELP.categoria} />
                    <Badge variant="outline">{items.length}</Badge>
                    <Button size="icon" variant="ghost" disabled={readOnly || catIndex === 0}
                      onClick={() => reorder.mutate({ kind: "category", ids: moveItem(grouped.map((g) => g.category.id), catIndex, catIndex - 1) })}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={readOnly || catIndex === grouped.length - 1}
                      onClick={() => reorder.mutate({ kind: "category", ids: moveItem(grouped.map((g) => g.category.id), catIndex, catIndex + 1) })}>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={readOnly}
                      onClick={() => { setSheetProduct(null); setSheetOpen(true); setCategoryFilter(category.id); }}>
                      <Plus className="mr-1 h-4 w-4" /> Produto
                    </Button>
                  </div>

                  {items.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Nenhum produto nesta categoria.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((p, index) => {
                        const availability = resolveAvailability(
                          { state: p.state, pausedUntil: p.paused_until, trackStock: p.track_stock, stockQuantity: p.stock_quantity },
                          { unitId: null, channel: null, now: new Date() },
                        );
                        return (
                          <li key={p.id} className="grid grid-cols-[3rem_1fr] items-center gap-x-3 gap-y-2 rounded-lg border p-3 sm:flex sm:flex-wrap">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                              <ImageOff className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => { setSheetProduct(p); setSheetOpen(true); }}
                            >
                              <span className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-medium">{p.name}</p>
                                <HelpHint text={HELP.produto} />
                              </span>
                              <p className="truncate text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  {formatCents(p.base_price_cents)}
                                  <HelpHint text={HELP.preco} />
                                </span>
                                {p.internal_code ? ` · ${p.internal_code}` : ""}
                                {p.prep_time_minutes ? ` · ${p.prep_time_minutes} min` : ""}
                              </p>
                            </button>
                            <div className="col-start-2 flex flex-wrap items-center gap-1 sm:col-auto">
                              <Badge variant={CATALOG_STATE_VARIANTS[p.state]}>{CATALOG_STATE_LABELS[p.state]}</Badge>
                              {!availability.available && availability.reason && p.state === "active" && (
                                <Badge variant="destructive">{UNAVAILABLE_LABELS[availability.reason]}</Badge>
                              )}
                              <HelpHint text={HELP.disponibilidade} />
                            </div>
                            <div className="col-span-2 flex items-center gap-1 border-t pt-2 sm:col-span-1 sm:border-0 sm:pt-0">
                              <Button size="icon" variant="ghost" disabled={readOnly || index === 0}
                                onClick={() => reorder.mutate({ kind: "product", ids: moveItem(items.map((x) => x.id), index, index - 1) })}>
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" disabled={readOnly || index === items.length - 1}
                                onClick={() => reorder.mutate({ kind: "product", ids: moveItem(items.map((x) => x.id), index, index + 1) })}>
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" disabled={readOnly || p.state === "archived"}
                                onClick={() => togglePause.mutate({ id: p.id, pause: p.state !== "paused" })}>
                                {p.state === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                              </Button>
                              <Button size="icon" variant="ghost" disabled={readOnly}
                                onClick={() => duplicateProduct.mutate({ productId: p.id })}>
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" disabled={readOnly || p.state === "archived"}
                                onClick={() => setArchiveTarget(p)}>
                                <Archive className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <ProductSheet
        product={sheetProduct}
        categoryId={categoryFilter !== "all" ? categoryFilter : (categories ?? [])[0]?.id ?? null}
        categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}

        open={sheetOpen}
        onOpenChange={setSheetOpen}
        readOnly={readOnly}
      />

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar “{archiveTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto sai do cardápio, mas continua nos pedidos já registrados, com o preço da época.
              Produtos arquivados não podem ser excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveTarget) archiveProduct.mutate(archiveTarget.id);
                setArchiveTarget(null);
              }}
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function PedidosCardapio() {
  return (
    <OrdersGuard operation="orders.catalog">
      <CatalogContent />
    </OrdersGuard>
  );
}

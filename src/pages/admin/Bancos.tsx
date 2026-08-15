import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Landmark, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getBankLogoUrl, type BankInfo } from "@/lib/banks";
import { z } from "zod";

type BankRow = Required<Pick<BankInfo, "id" | "slug" | "name">> & BankInfo;

const logoUrlSchema = z
  .string()
  .trim()
  .max(500, "URL muito longa (máx. 500 caracteres)")
  .url("URL inválida — use o formato https://...")
  .refine((v) => /^https?:\/\//i.test(v), "A URL deve começar com http:// ou https://")
  .refine(
    (v) => /\.(png|jpe?g|svg|webp|gif|avif)(\?.*)?$/i.test(v),
    "A URL deve apontar para uma imagem (.png, .jpg, .svg, .webp, .gif, .avif)",
  );

function validateLogoUrl(value: string): string | null {
  if (!value.trim()) return null;
  const result = logoUrlSchema.safeParse(value);
  return result.success ? null : result.error.issues[0]?.message ?? "URL inválida";
}

function probeImage(url: string, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.src = "";
      resolve(false);
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}

export default function AdminBancos() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<BankRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BankRow | null>(null);

  const { data: banks = [], isLoading } = useQuery({
    queryKey: ["admin-banks"],
    queryFn: async (): Promise<BankRow[]> => {
      const { data, error } = await supabase
        .from("banks" as never)
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as BankRow[];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-banks"] });
    queryClient.invalidateQueries({ queryKey: ["banks"] });
  };

  const toggleActive = async (bank: BankRow) => {
    const { error } = await supabase
      .from("banks" as never)
      .update({ is_active: !bank.is_active } as never)
      .eq("id", bank.id);
    if (error) toast.error("Erro ao atualizar status");
    else refresh();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("banks" as never).delete().eq("id", deleting.id);
    if (error) toast.error("Erro ao excluir banco");
    else {
      toast.success("Banco excluído");
      refresh();
    }
    setDeleting(null);
  };

  const filtered = banks.filter(
    (b) =>
      !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.slug.toLowerCase().includes(search.toLowerCase()) ||
      (b.domain ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const move = async (bank: BankRow, direction: -1 | 1) => {
    const idx = filtered.findIndex((b) => b.id === bank.id);
    const neighbor = filtered[idx + direction];
    if (!neighbor) return;
    const a = bank.sort_order ?? 100;
    const b = neighbor.sort_order ?? 100;
    const aNew = a === b ? a + direction : b;
    const bNew = a === b ? a : a;
    const [r1, r2] = await Promise.all([
      supabase.from("banks" as never).update({ sort_order: aNew } as never).eq("id", bank.id),
      supabase.from("banks" as never).update({ sort_order: bNew } as never).eq("id", neighbor.id),
    ]);
    if (r1.error || r2.error) toast.error("Erro ao reordenar");
    else refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <AdminPageHeader
          title="Bancos"
          description="Gerencie a lista de bancos disponíveis no cadastro de contas financeiras."
        />
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Banco
        </Button>
      </div>


      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, slug ou domínio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
                <Landmark className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">Nenhum banco encontrado</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((b, idx) => {
              const logo = getBankLogoUrl(b, 48);
              const isFirst = idx === 0;
              const isLast = idx === filtered.length - 1;
              return (
                <Card key={b.id} className={!b.is_active ? "opacity-60" : ""}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex flex-col -my-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={isFirst || !!search}
                        onClick={() => move(b, -1)}
                        title="Mover para cima"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={isLast || !!search}
                        onClick={() => move(b, 1)}
                        title="Mover para baixo"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {logo ? (
                      <img
                        src={logo}
                        alt=""
                        className="h-10 w-10 rounded-lg object-contain bg-white border"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <Landmark className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{b.name}</p>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {b.slug}
                        </Badge>
                        {!b.is_active && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            Inativo
                          </Badge>
                        )}
                        {b.logo_url && (
                          <Badge className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-0">
                            Logo custom
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {b.domain || "sem domínio"} · ordem {b.sort_order}
                      </p>
                    </div>
                    <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditing(b)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleting(b)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      <BankFormDialog
        open={creating || !!editing}
        bank={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir banco</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleting?.name}</strong>? Contas existentes
              vinculadas a este slug deixarão de mostrar o logo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BankFormDialog({
  open,
  bank,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  bank: BankRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = !!bank;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(100);
  const [isActive, setIsActive] = useState(true);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoWarning, setLogoWarning] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLogoError(null);
    setLogoWarning(null);
    if (bank) {
      setName(bank.name);
      setSlug(bank.slug);
      setDomain(bank.domain ?? "");
      setLogoUrl(bank.logo_url ?? "");
      setSortOrder(bank.sort_order ?? 100);
      setIsActive(bank.is_active ?? true);
      setSlugTouched(true);
    } else {
      setName("");
      setSlug("");
      setDomain("");
      setLogoUrl("");
      setSortOrder(100);
      setIsActive(true);
      setSlugTouched(false);
    }
  }, [open, bank]);

  const previewLogo = getBankLogoUrl({ logo_url: logoUrl || null, domain: domain || null }, 64);

  const handleLogoBlur = async () => {
    const trimmed = logoUrl.trim();
    setLogoWarning(null);
    const err = validateLogoUrl(trimmed);
    setLogoError(err);
    if (err || !trimmed) return;
    setProbing(true);
    const ok = await probeImage(trimmed);
    setProbing(false);
    if (!ok) {
      setLogoWarning(
        "Não foi possível carregar a imagem desta URL. Verifique se o link é público e aponta para uma imagem válida.",
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.error("Nome e slug são obrigatórios");
      return;
    }
    const err = validateLogoUrl(logoUrl);
    if (err) {
      setLogoError(err);
      toast.error(err);
      return;
    }
    setSaving(true);
    const basePayload = {
      name: name.trim(),
      domain: domain.trim() || null,
      logo_url: logoUrl.trim() || null,
      sort_order: sortOrder || 100,
      is_active: isActive,
    };

    const body = isEdit
      ? { action: "update" as const, id: bank!.id, ...basePayload }
      : { action: "create" as const, slug: slug.trim(), ...basePayload };

    const { data, error } = await supabase.functions.invoke("admin-save-bank", { body });

    const serverError =
      (data && typeof data === "object" && "error" in data ? (data as { error: unknown }).error : null) ?? null;

    if (error || serverError) {
      const msg =
        typeof serverError === "string"
          ? serverError
          : error?.message || "Erro ao salvar banco";
      toast.error(msg);
    } else {
      toast.success(isEdit ? "Banco atualizado" : "Banco criado");
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Banco" : "Novo Banco"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="ex: nubank"
                maxLength={50}
                required
                disabled={isEdit}
              />
              {isEdit && (
                <p className="text-[10px] text-muted-foreground">O slug não pode ser alterado.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value || "100", 10))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Domínio (para Logo.dev)</Label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ex: nubank.com.br"
                maxLength={120}
              />
              <p className="text-[10px] text-muted-foreground">
                Usado para buscar o logo automaticamente em img.logo.dev quando não houver URL customizada.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bank-logo-url">URL do logo customizado (opcional)</Label>
              <Input
                id="bank-logo-url"
                value={logoUrl}
                onChange={(e) => {
                  setLogoUrl(e.target.value);
                  if (logoError) setLogoError(null);
                  if (logoWarning) setLogoWarning(null);
                }}
                onBlur={handleLogoBlur}
                placeholder="https://exemplo.com/logo.png"
                maxLength={500}
                aria-invalid={!!logoError}
                aria-describedby="bank-logo-url-help"
                className={logoError ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {logoError ? (
                <p className="text-[11px] text-destructive">{logoError}</p>
              ) : logoWarning ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-500">{logoWarning}</p>
              ) : probing ? (
                <p className="text-[10px] text-muted-foreground">Verificando imagem...</p>
              ) : (
                <p id="bank-logo-url-help" className="text-[10px] text-muted-foreground">
                  Se preenchido, substitui o logo automático. Use https e formato .png, .jpg, .svg, .webp, .gif ou .avif.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3">
            {previewLogo ? (
              <img
                src={previewLogo}
                alt="preview"
                className="h-12 w-12 rounded-lg object-contain bg-white border"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                <Landmark className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="text-xs">
              <p className="font-medium">Pré-visualização</p>
              <p className="text-muted-foreground">
                {logoUrl ? "Logo customizado" : domain ? "Via Logo.dev" : "Sem logo"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Ativo</p>
              <p className="text-xs text-muted-foreground">
                Quando desativado, não aparece no seletor de bancos.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !!logoError}>
              {saving ? "Salvando..." : isEdit ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { AlertCircle, CheckCircle2, Wand2, Trash2, Save, X, Search } from "lucide-react";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";
import { useDRERubricas, useDREMapeamento, useDRERealtime } from "@/hooks/useDRE";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";
import { DRESubNav } from "./DRESubNav";

type PendingChange = { rubricaId: string; existingId?: string };

export default function DREMapeamento() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { role } = useCompanyPermissions();
  const canEdit = role === "owner" || role === "admin";

  const [showOnlyUnmapped, setShowOnlyUnmapped] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Record<string, PendingChange>>({});
  const [saving, setSaving] = useState(false);

  const { data: rubricas = [] } = useDRERubricas();
  const { data: mapeamentos = [], upsert, remove, applyDefault } = useDREMapeamento();
  useDRERealtime();

  const { data: categorias = [] } = useQuery({
    queryKey: ["dre-categorias-company", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_accessible_categories", {
        _context: "pj",
        _company_id: selectedCompanyId!,
        _transaction_type: null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const mapPorCategoria = useMemo(() => {
    const m = new Map<string, typeof mapeamentos>();
    for (const map of mapeamentos) {
      const arr = m.get(map.categoria_id) ?? [];
      arr.push(map);
      m.set(map.categoria_id, arr);
    }
    return m;
  }, [mapeamentos]);

  const filtered = useMemo(() => {
    return categorias.filter((c: any) => {
      const mapped = (mapPorCategoria.get(c.id)?.length ?? 0) > 0 || !!pending[c.id];
      if (showOnlyUnmapped && mapped) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [categorias, mapPorCategoria, pending, showOnlyUnmapped, search]);

  const unmappedCount = categorias.filter((c: any) => !mapPorCategoria.get(c.id) && !pending[c.id]).length;
  const pendingCount = Object.keys(pending).length;

  const rubricasSelecionaveis = rubricas.filter((r) => r.editavel_usuario || !r.is_calculada);

  const handleStage = (categoriaId: string, rubricaId: string, existingId?: string) => {
    setPending((prev) => ({ ...prev, [categoriaId]: { rubricaId, existingId } }));
  };

  const handleDiscard = () => setPending({});

  const handleSaveAll = async () => {
    if (pendingCount === 0) return;
    setSaving(true);
    let ok = 0;
    let fail = 0;
    for (const [categoriaId, change] of Object.entries(pending)) {
      try {
        await upsert.mutateAsync({
          id: change.existingId,
          categoria_id: categoriaId,
          rubrica_id: change.rubricaId,
          percentual_alocacao: 100,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setSaving(false);
    setPending({});
    if (fail === 0) toast.success(`${ok} mapeamento(s) salvo(s). DRE atualizada.`);
    else toast.warning(`${ok} salvo(s), ${fail} com erro.`);
  };

  const handleApplyDefault = async () => {
    try {
      const count = await applyDefault.mutateAsync();
      toast.success(`${count} categorias mapeadas automaticamente`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    }
  };

  if (contextType !== "pj" || !selectedCompanyId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Selecione uma empresa</AlertTitle>
          <AlertDescription>Este módulo é exclusivo do contexto empresarial.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Mapeamento DRE | Gestor Plin</title></Helmet>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link to="/relatorios/dre" className="hover:underline flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Voltar à DRE
            </Link>
          </div>
          <h1 className="text-2xl font-semibold">Mapeamento de Categorias</h1>
          <p className="text-sm text-muted-foreground">Vincule cada categoria financeira a uma rubrica contábil da DRE.</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handleApplyDefault} disabled={applyDefault.isPending || saving}>
              <Wand2 className="h-4 w-4 mr-1.5" />
              Aplicar mapeamento padrão
            </Button>
            {pendingCount > 0 && (
              <Button variant="ghost" onClick={handleDiscard} disabled={saving}>
                <X className="h-4 w-4 mr-1.5" />
                Descartar
              </Button>
            )}
            <Button onClick={handleSaveAll} disabled={pendingCount === 0 || saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? "Salvando…" : `Salvar mapeamento${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
            </Button>
          </div>
        )}
      </div>

      {pendingCount > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{pendingCount} alteração(ões) pendente(s)</AlertTitle>
          <AlertDescription>
            Clique em <strong>Salvar mapeamento</strong> para aplicar as mudanças. A DRE será atualizada automaticamente.
          </AlertDescription>
        </Alert>
      )}

      {unmappedCount > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{unmappedCount} categoria(s) sem mapeamento</AlertTitle>
          <AlertDescription>
            Categorias não mapeadas serão ignoradas na geração da DRE.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            Categorias
            <Badge variant="secondary">{categorias.length}</Badge>
            <div className="ml-auto flex items-center gap-2">
              <Input
                placeholder="Buscar categoria…"
                className="h-8 w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button variant={showOnlyUnmapped ? "default" : "outline"} size="sm" onClick={() => setShowOnlyUnmapped(!showOnlyUnmapped)}>
                Só não mapeadas
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Categoria</th>
                  <th className="text-left px-4 py-2 font-medium w-24">Tipo</th>
                  <th className="text-left px-4 py-2 font-medium">Rubrica DRE</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cat: any) => {
                  const maps = mapPorCategoria.get(cat.id) ?? [];
                  const primary = maps[0];
                  const pend = pending[cat.id];
                  const currentValue = pend?.rubricaId ?? primary?.rubrica_id ?? "";
                  const isDirty = !!pend && pend.rubricaId !== primary?.rubrica_id;
                  return (
                    <tr key={cat.id} className={`border-b last:border-0 hover:bg-muted/30 ${isDirty ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}>
                      <td className="px-4 py-2 font-medium">{cat.name}</td>
                      <td className="px-4 py-2">
                        <Badge variant={cat.transaction_type === "receita" ? "default" : "secondary"} className="text-[10px]">
                          {cat.transaction_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Select
                            value={currentValue}
                            onValueChange={(v) => handleStage(cat.id, v, primary?.id)}
                            disabled={!canEdit || saving}
                          >
                            <SelectTrigger className="h-8 max-w-xs">
                              <SelectValue placeholder="Selecione uma rubrica…" />
                            </SelectTrigger>
                            <SelectContent>
                              {rubricasSelecionaveis.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  <span className="text-xs text-muted-foreground mr-2">{r.codigo}</span>
                                  {r.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isDirty ? (
                            <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-400">
                              pendente
                            </Badge>
                          ) : primary ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {primary && canEdit && (
                          <Button variant="ghost" size="icon" onClick={() => remove.mutate(primary.id)} disabled={saving}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhuma categoria encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, CheckCircle2, Wand2, Trash2 } from "lucide-react";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";
import { useDRERubricas, useDREMapeamento } from "@/hooks/useDRE";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

export default function DREMapeamento() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { role } = useCompanyPermissions();
  const canEdit = role === "owner" || role === "admin";

  const [showOnlyUnmapped, setShowOnlyUnmapped] = useState(false);
  const [search, setSearch] = useState("");

  const { data: rubricas = [] } = useDRERubricas();
  const { data: mapeamentos = [], upsert, remove, applyDefault } = useDREMapeamento();

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
      const mapped = (mapPorCategoria.get(c.id)?.length ?? 0) > 0;
      if (showOnlyUnmapped && mapped) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [categorias, mapPorCategoria, showOnlyUnmapped, search]);

  const unmappedCount = categorias.filter((c: any) => !mapPorCategoria.get(c.id)).length;

  const rubricasSelecionaveis = rubricas.filter((r) => r.editavel_usuario || !r.is_calculada);

  const handleAssign = async (categoriaId: string, rubricaId: string, existingId?: string) => {
    try {
      await upsert.mutateAsync({ id: existingId, categoria_id: categoriaId, rubrica_id: rubricaId, percentual_alocacao: 100 });
      toast.success("Mapeamento atualizado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    }
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
          <Button onClick={handleApplyDefault} disabled={applyDefault.isPending}>
            <Wand2 className="h-4 w-4 mr-1.5" />
            Aplicar mapeamento padrão
          </Button>
        )}
      </div>

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
                  return (
                    <tr key={cat.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{cat.name}</td>
                      <td className="px-4 py-2">
                        <Badge variant={cat.transaction_type === "receita" ? "default" : "secondary"} className="text-[10px]">
                          {cat.transaction_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Select
                            value={primary?.rubrica_id ?? ""}
                            onValueChange={(v) => handleAssign(cat.id, v)}
                            disabled={!canEdit}
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
                          {primary && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {primary && canEdit && (
                          <Button variant="ghost" size="icon" onClick={() => remove.mutate(primary.id)}>
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

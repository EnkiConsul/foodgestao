import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import type { Database } from "@/integrations/supabase/types";

type Lancamento = Database["public"]["Tables"]["dp_folha_lancamentos"]["Row"] & {
  dp_colaboradores?: { nome: string } | null;
  dp_folha_periodos?: { competencia: string; tipo: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aprovado_dp: "Aprovado DP",
  aprovado_financeiro: "Aprovado Fin.",
  pago: "Pago",
  cancelado: "Cancelado",
};

const TIPO_LABEL: Record<string, string> = {
  adiantamento: "Adiantamento",
  contracheque_mensal: "Mensal",
  contracheque_quinzenal: "Quinzenal",
  decimo_terceiro: "13º",
};

export default function DpFolhaAprovacoes() {
  const { selectedCompanyId } = useCompanyContext();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [accountId, setAccountId] = useState<string>("");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [competenciaFilter, setCompetenciaFilter] = useState<string>("");
  const qc = useQueryClient();

  const accounts = useQuery({
    queryKey: ["accounts_pj", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts").select("id, name")
        .eq("company_id", selectedCompanyId!)
        .eq("context", "pj").eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lancs = useQuery({
    queryKey: ["dp_folha_aprovacoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folha_lancamentos")
        .select("*, dp_colaboradores(nome), dp_folha_periodos(competencia, tipo)")
        .eq("company_id", selectedCompanyId!)
        .eq("status", "aprovado_dp")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Lancamento[];
    },
  });

  const filtered = useMemo(() => {
    return (lancs.data ?? []).filter((l) => {
      if (tipoFilter !== "all" && l.dp_folha_periodos?.tipo !== tipoFilter) return false;
      if (competenciaFilter && !l.dp_folha_periodos?.competencia?.startsWith(competenciaFilter)) return false;
      return true;
    });
  }, [lancs.data, tipoFilter, competenciaFilter]);

  const totalSelecionado = useMemo(() => {
    return (lancs.data ?? [])
      .filter((l) => selected.has(l.id))
      .reduce((s, l) => s + Number(l.valor_liquido), 0);
  }, [lancs.data, selected]);

  const aprovar = useMutation({
    mutationFn: async () => {
      if (selected.size === 0) throw new Error("Selecione ao menos um lançamento");
      if (!accountId) throw new Error("Selecione a conta bancária de origem");
      const { error } = await supabase
        .from("dp_folha_lancamentos")
        .update({ status: "aprovado_financeiro", financeiro_account_id: accountId })
        .in("id", Array.from(selected));
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Aprovado. Despesas geradas no financeiro." });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["dp_folha_aprovacoes"] });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const rejeitar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("dp_folha_lancamentos")
        .update({ status: "cancelado" })
        .in("id", Array.from(selected));
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Lançamentos rejeitados" });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["dp_folha_aprovacoes"] });
    },
  });

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleAll = () => setSelected((s) => s.size === filtered.length ? new Set() : new Set(filtered.map(l => l.id)));

  return (
    <DpPage>
      <DpPageHeader
        icon={WalletCards}
        title="Aprovações do Financeiro"
        description="Aprove lançamentos de folha para gerar despesas a pagar automaticamente."
      />

      <DpFilterCard>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(TIPO_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="month"
            value={competenciaFilter}
            onChange={(e) => setCompetenciaFilter(e.target.value)}
            className="w-44"
            placeholder="Competência"
          />
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Conta bancária de origem *" /></SelectTrigger>
            <SelectContent>
              {accounts.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => aprovar.mutate()} disabled={aprovar.isPending || selected.size === 0 || !accountId}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar {selected.size} · R$ {totalSelecionado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={rejeitar.isPending || selected.size === 0}>
                <XCircle className="h-4 w-4 mr-1" /> Rejeitar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rejeitar {selected.size} lançamento(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os lançamentos serão marcados como cancelados. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => rejeitar.mutate()}>Rejeitar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DpFilterCard>

      <DpContentCard contentClassName="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum lançamento aguardando aprovação.</TableCell></TableRow>
            )}
            {filtered.map((l) => (
              <TableRow key={l.id}>
                <TableCell><Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} /></TableCell>
                <TableCell>{l.dp_colaboradores?.nome ?? "—"}</TableCell>
                <TableCell className="text-xs">{TIPO_LABEL[l.dp_folha_periodos?.tipo ?? ""] ?? l.dp_folha_periodos?.tipo?.replace(/_/g, " ")}</TableCell>
                <TableCell className="text-xs">{l.dp_folha_periodos?.competencia ? new Date(l.dp_folha_periodos.competencia).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "—"}</TableCell>
                <TableCell className="text-right">R$ {Number(l.valor_liquido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                <TableCell><Badge variant="outline">{STATUS_LABEL[l.status] ?? l.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DpContentCard>
    </DpPage>
  );
}

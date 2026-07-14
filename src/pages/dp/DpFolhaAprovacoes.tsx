import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Lancamento = Database["public"]["Tables"]["dp_folha_lancamentos"]["Row"] & {
  dp_colaboradores?: { nome: string } | null;
  dp_folha_periodos?: { competencia: string; tipo: string } | null;
};

export default function DpFolhaAprovacoes() {
  const { selectedCompanyId } = useCompanyContext();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [accountId, setAccountId] = useState<string>("");
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

  const aprovar = useMutation({
    mutationFn: async () => {
      if (selected.size === 0) throw new Error("Selecione ao menos um lançamento");
      const payload: { status: "aprovado_financeiro"; financeiro_account_id?: string } = { status: "aprovado_financeiro" };
      if (accountId) payload.financeiro_account_id = accountId;
      const { error } = await supabase
        .from("dp_folha_lancamentos")
        .update(payload)
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
  const toggleAll = () => setSelected((s) => s.size === lancs.data?.length ? new Set() : new Set((lancs.data ?? []).map(l => l.id)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Aprovações do Financeiro</h1>
        <p className="text-sm text-muted-foreground">Aprove lançamentos de folha para gerar despesas a pagar automaticamente.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Conta bancária de origem (opcional)" /></SelectTrigger>
          <SelectContent>
            {accounts.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => aprovar.mutate()} disabled={aprovar.isPending || selected.size === 0}>
          <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar ({selected.size})
        </Button>
        <Button size="sm" variant="outline" onClick={() => rejeitar.mutate()} disabled={rejeitar.isPending || selected.size === 0}>
          <XCircle className="h-4 w-4 mr-1" /> Rejeitar
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={selected.size > 0 && selected.size === lancs.data?.length} onCheckedChange={toggleAll} />
            </TableHead>
            <TableHead>Colaborador</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Competência</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lancs.data?.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum lançamento aguardando aprovação.</TableCell></TableRow>
          )}
          {lancs.data?.map((l) => (
            <TableRow key={l.id}>
              <TableCell><Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} /></TableCell>
              <TableCell>{l.dp_colaboradores?.nome ?? "—"}</TableCell>
              <TableCell className="text-xs">{l.dp_folha_periodos?.tipo.replace(/_/g, " ")}</TableCell>
              <TableCell className="text-xs">{l.dp_folha_periodos?.competencia ? new Date(l.dp_folha_periodos.competencia).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "—"}</TableCell>
              <TableCell className="text-right">R$ {Number(l.valor_liquido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
              <TableCell><Badge variant="outline">{l.status}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

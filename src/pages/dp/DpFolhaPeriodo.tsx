import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send, CheckCircle2, Wallet, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import type { Database } from "@/integrations/supabase/types";

type Lancamento = Database["public"]["Tables"]["dp_folha_lancamentos"]["Row"] & {
  dp_colaboradores?: { nome: string; matricula: string | null } | null;
};

const STATUS_LANC_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aprovado_dp: "Aprovado DP",
  aprovado_financeiro: "Aprovado Fin.",
  pago: "Pago",
  cancelado: "Cancelado",
};

const STATUS_PERIODO_LABEL: Record<string, string> = {
  aberto: "Aberto",
  fechado: "Fechado",
  aprovado_dp: "Aprovado DP",
  aprovado_financeiro: "Aprovado Financeiro",
  pago: "Pago",
};

export default function DpFolhaPeriodo() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  const periodoQ = useQuery({
    queryKey: ["dp_folha_periodo", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_folha_periodos").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const lancsQ = useQuery({
    queryKey: ["dp_folha_lancamentos", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folha_lancamentos")
        .select("*, dp_colaboradores(nome, matricula)")
        .eq("periodo_id", id!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Lancamento[];
    },
  });

  const gerar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("dp_folha_gerar_lancamentos", { _periodo_id: id! });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast({ title: `${n} lançamento(s) gerado(s)` });
      qc.invalidateQueries({ queryKey: ["dp_folha_lancamentos", id] });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateValor = useMutation({
    mutationFn: async ({ lid, v }: { lid: string; v: number }) => {
      const { error } = await supabase
        .from("dp_folha_lancamentos")
        .update({ valor_liquido: v })
        .eq("id", lid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_folha_lancamentos", id] }),
    onError: (e: Error) => toast({ title: "Erro ao atualizar valor", description: e.message, variant: "destructive" }),
  });

  const enviarFinanceiro = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("dp_folha_enviar_financeiro" as any, { _periodo_id: id! });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Enviado para aprovação do Financeiro" });
      qc.invalidateQueries({ queryKey: ["dp_folha_periodo", id] });
      qc.invalidateQueries({ queryKey: ["dp_folha_lancamentos", id] });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const reabrir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("dp_folha_reabrir_periodo" as any, { _periodo_id: id! });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Período reaberto" });
      qc.invalidateQueries({ queryKey: ["dp_folha_periodo", id] });
      qc.invalidateQueries({ queryKey: ["dp_folha_lancamentos", id] });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const p = periodoQ.data;
  const lancs = lancsQ.data ?? [];
  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lancs;
    return lancs.filter((l) =>
      l.dp_colaboradores?.nome?.toLowerCase().includes(q) ||
      l.dp_colaboradores?.matricula?.toLowerCase().includes(q),
    );
  }, [lancs, busca]);

  const total = filtered.reduce((s, l) => s + Number(l.valor_liquido), 0);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of lancs) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [lancs]);

  const canSend = p?.status === "aberto" && (counts["rascunho"] ?? 0) > 0;
  const canReopen = p?.status === "aprovado_dp";

  return (
    <DpPage>
      {p && (
        <DpPageHeader
          icon={Wallet}
          title={`${p.tipo.replace(/_/g, " ")} — ${new Date(p.competencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
          description={`Total: R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · Status: ${STATUS_PERIODO_LABEL[p.status] ?? p.status}`}
          
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending || p.status !== "aberto"}>
                <RefreshCw className="h-4 w-4 mr-1" /> Gerar lançamentos
              </Button>
              {canReopen && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <RotateCcw className="h-4 w-4 mr-1" /> Reabrir período
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reabrir período?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Todos os lançamentos voltarão para rascunho e o período retornará ao status Aberto.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => reabrir.mutate()}>Reabrir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button size="sm" onClick={() => enviarFinanceiro.mutate()} disabled={enviarFinanceiro.isPending || !canSend}>
                <Send className="h-4 w-4 mr-1" /> Enviar p/ Financeiro
              </Button>
            </>
          }
        />
      )}

      <DpFilterCard>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Buscar por colaborador ou matrícula"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-72"
          />
          <div className="flex gap-2 text-xs">
            {Object.entries(counts).map(([k, v]) => (
              <Badge key={k} variant="outline">{STATUS_LANC_LABEL[k] ?? k}: {v}</Badge>
            ))}
          </div>
        </div>
      </DpFilterCard>

      <DpContentCard contentClassName="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Matrícula</TableHead>
              <TableHead className="text-right">Valor líquido</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                Nenhum lançamento. Clique em "Gerar lançamentos" para popular a lista.
              </TableCell></TableRow>
            )}
            {filtered.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.dp_colaboradores?.nome ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{l.dp_colaboradores?.matricula ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={l.valor_liquido}
                    disabled={l.status !== "rascunho"}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v !== Number(l.valor_liquido)) updateValor.mutate({ lid: l.id, v });
                    }}
                    className="w-32 ml-auto text-right"
                  />
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="gap-1">
                    {l.status === "pago" && <CheckCircle2 className="h-3 w-3" />}
                    {STATUS_LANC_LABEL[l.status] ?? l.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DpContentCard>
    </DpPage>
  );
}

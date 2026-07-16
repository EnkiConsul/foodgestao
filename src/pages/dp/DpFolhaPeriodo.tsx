import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Send, CheckCircle2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import type { Database } from "@/integrations/supabase/types";

type Lancamento = Database["public"]["Tables"]["dp_folha_lancamentos"]["Row"] & {
  dp_colaboradores?: { nome: string; matricula: string | null } | null;
};

const STATUS: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "secondary" },
  aprovado_dp: { label: "Aprovado DP", color: "default" },
  aprovado_financeiro: { label: "Aprovado Fin.", color: "default" },
  pago: { label: "Pago", color: "default" },
  cancelado: { label: "Cancelado", color: "destructive" },
};

export default function DpFolhaPeriodo() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

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
        .update({ valor_bruto: v, valor_liquido: v })
        .eq("id", lid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_folha_lancamentos", id] }),
  });

  const enviarFinanceiro = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase
        .from("dp_folha_lancamentos")
        .update({ status: "aprovado_dp" })
        .eq("periodo_id", id!)
        .eq("status", "rascunho");
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("dp_folha_periodos")
        .update({ status: "aprovado_dp" })
        .eq("id", id!);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast({ title: "Enviado para aprovação do Financeiro" });
      qc.invalidateQueries({ queryKey: ["dp_folha_periodo", id] });
      qc.invalidateQueries({ queryKey: ["dp_folha_lancamentos", id] });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const p = periodoQ.data;
  const total = (lancsQ.data ?? []).reduce((s, l) => s + Number(l.valor_liquido), 0);

  return (
    <DpPage>
      <Button asChild variant="ghost" size="sm">
        <Link to="/dp/folha"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
      </Button>

      {p && (
        <DpPageHeader
          icon={Wallet}
          title={`${p.tipo.replace(/_/g, " ")} — ${new Date(p.competencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
          description={`Total: R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · Status: ${p.status}`}
          actions={
            <>
            <Button variant="outline" size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" /> Gerar lançamentos
            </Button>
            <Button size="sm" onClick={() => enviarFinanceiro.mutate()} disabled={enviarFinanceiro.isPending || p.status !== "aberto"}>
              <Send className="h-4 w-4 mr-1" /> Enviar p/ Financeiro
            </Button>
            </>
          }
        />
      )}

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
          {lancsQ.data?.length === 0 && (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">
              Nenhum lançamento. Clique em "Gerar lançamentos" para popular a lista.
            </TableCell></TableRow>
          )}
          {lancsQ.data?.map((l) => (
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
                  {STATUS[l.status]?.label ?? l.status}
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

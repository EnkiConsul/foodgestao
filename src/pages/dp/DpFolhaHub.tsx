import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_folha_tipo"];
type Periodo = Database["public"]["Tables"]["dp_folha_periodos"]["Row"];

const TIPOS: { key: Tipo; label: string }[] = [
  { key: "adiantamento", label: "Adiantamento" },
  { key: "contracheque_mensal", label: "Mensal" },
  { key: "contracheque_quinzenal", label: "Quinzenal" },
  { key: "decimo_terceiro", label: "13º" },
];

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  fechado: "Fechado",
  aprovado_dp: "Aprovado DP",
  aprovado_financeiro: "Aprovado Financeiro",
  pago: "Pago",
};

function NovoPeriodoDialog({ tipo, companyId }: { tipo: Tipo; companyId: string }) {
  const [open, setOpen] = useState(false);
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [dataPagamento, setDataPagamento] = useState("");
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      // Pré-check de duplicidade (company_id + competencia + tipo)
      const { data: existing } = await supabase
        .from("dp_folha_periodos")
        .select("id")
        .eq("company_id", companyId)
        .eq("competencia", competencia)
        .eq("tipo", tipo)
        .maybeSingle();
      if (existing) throw new Error("Já existe um período com essa competência e tipo.");

      const { error } = await supabase.from("dp_folha_periodos").insert({
        company_id: companyId,
        competencia,
        tipo,
        data_pagamento: dataPagamento || null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Já existe um período com essa competência e tipo.");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_folha_periodos"] });
      toast({ title: "Período criado" });
      setOpen(false);
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo período</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo período — {TIPOS.find(t => t.key === tipo)?.label}</DialogTitle>
          <DialogDescription>Defina a competência (mês/ano) e a data de pagamento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Competência</Label>
            <Input type="month" value={competencia.slice(0, 7)} onChange={(e) => setCompetencia(e.target.value + "-01")} />
          </div>
          <div>
            <Label>Data de pagamento</Label>
            <Input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PeriodosLista({ tipo, companyId, statusFilter }: { tipo: Tipo; companyId: string; statusFilter: string }) {
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["dp_folha_periodos", companyId, tipo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folha_periodos")
        .select("*")
        .eq("company_id", companyId)
        .eq("tipo", tipo)
        .order("competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Periodo[];
    },
  });

  const filtered = useMemo(
    () => (q.data ?? []).filter((p) => statusFilter === "all" ? true : p.status === statusFilter),
    [q.data, statusFilter],
  );

  return (
    <div className="space-y-2">
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhum período encontrado.</p>}
      {filtered.map((p) => (
        <Card key={p.id} className="dp-content-card cursor-pointer hover:bg-muted/50" onClick={() => nav(`/dp/folha/periodos/${p.id}`)}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{new Date(p.competencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
              <div className="text-xs text-muted-foreground">
                {p.data_pagamento ? `Pagamento: ${new Date(p.data_pagamento).toLocaleDateString("pt-BR")}` : "Sem data de pagamento"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{STATUS_LABEL[p.status] ?? p.status}</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DpFolhaHub() {
  const nav = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const [tab, setTab] = useState<Tipo>("adiantamento");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  if (!selectedCompanyId) return <DpPage><DpContentCard contentClassName="p-6"><p className="text-muted-foreground">Selecione uma empresa.</p></DpContentCard></DpPage>;

  return (
    <DpPage>
      <DpPageHeader
        icon={Wallet}
        title="Folha de Pagamento"
        description="Gerencie períodos de adiantamento, mensal, quinzenal e 13º."
        actions={
          <Button variant="outline" size="sm" onClick={() => nav("/dp/folha/aprovacoes")}>
            Aprovações
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tipo)}>
        <DpFilterCard>
          <div className="flex flex-wrap items-center gap-3">
            <TabsList>
              {TIPOS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DpFilterCard>
        {TIPOS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="space-y-3">
            <div className="flex justify-end">
              <NovoPeriodoDialog tipo={t.key} companyId={selectedCompanyId} />
            </div>
            <PeriodosLista tipo={t.key} companyId={selectedCompanyId} statusFilter={statusFilter} />
          </TabsContent>
        ))}
      </Tabs>
    </DpPage>
  );
}

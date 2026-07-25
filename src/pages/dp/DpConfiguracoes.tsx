import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Settings, CalendarClock, ShieldAlert, Info, Save, Trash2, BellRing } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPendenciasConfig, DP_PENDENCIAS_CONFIG_DEFAULT, type DpPendenciasConfig } from "@/hooks/useDpPendenciasConfig";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type DiaConfig = {
  id: string;
  data: string;
  limite_folgas: number;
  observacao: string | null;
  unidade_id: string | null;
};

export default function DpConfiguracoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const [novaData, setNovaData] = useState("");
  const [novoLimite, setNovoLimite] = useState<string>("");
  const [novaObs, setNovaObs] = useState("");
  const [toDelete, setToDelete] = useState<DiaConfig | null>(null);

  const dias = useQuery({
    queryKey: ["dp_dia_config_all", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DiaConfig[]> => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("dp_dia_config")
        .select("id, data, limite_folgas, observacao, unidade_id")
        .eq("company_id", selectedCompanyId!)
        .gte("data", hoje)
        .order("data");
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async ({ id, data, limite, observacao }: { id?: string; data: string; limite: number; observacao: string | null }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (id) {
        const { error } = await supabase
          .from("dp_dia_config")
          .update({ limite_folgas: limite, observacao })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dp_dia_config")
          .insert({ company_id: selectedCompanyId, data, limite_folgas: limite, observacao });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["dp_dia_config_all"] });
      qc.invalidateQueries({ queryKey: ["dp_dia_config"] });
      qc.invalidateQueries({ queryKey: ["dp_dia_config_hub"] });
      setNovaData(""); setNovoLimite(""); setNovaObs("");
    },
    onError: (e) => toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_dia_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração removida");
      qc.invalidateQueries({ queryKey: ["dp_dia_config_all"] });
      qc.invalidateQueries({ queryKey: ["dp_dia_config"] });
      qc.invalidateQueries({ queryKey: ["dp_dia_config_hub"] });
    },
    onError: (e) => toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) }),
  });

  const rows = useMemo(() => dias.data ?? [], [dias.data]);

  const handleAdd = () => {
    if (!novaData) return toast.error("Selecione a data");
    const lim = Number(novoLimite);
    if (!Number.isFinite(lim) || lim < 0) return toast.error("Limite inválido");
    upsert.mutate({ data: novaData, limite: lim, observacao: novaObs.trim() || null });
  };

  const handleUpdateRow = (row: DiaConfig, campo: "limite_folgas" | "observacao", valor: string) => {
    if (campo === "limite_folgas") {
      const lim = Number(valor);
      if (!Number.isFinite(lim) || lim < 0) return;
      upsert.mutate({ id: row.id, data: row.data, limite: lim, observacao: row.observacao });
    } else {
      upsert.mutate({ id: row.id, data: row.data, limite: row.limite_folgas, observacao: valor.trim() || null });
    }
  };

  return (
    <DpPage>
      <Helmet><title>Configurações do DP — DP 360°</title></Helmet>
      <DpPageHeader
        icon={Settings}
        title="Configurações do DP"
        description="Consolide regras de folga, bloqueios e prazos gerais do departamento pessoal."
      />

      <DpContentCard>
        <div className="mb-4">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" /> Limites de folga por dia
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Defina, por data, quantas folgas simultâneas são permitidas. Sem configuração, o sistema usa o fallback padrão.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-[160px_120px_1fr_auto] items-end mb-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Data</Label>
            <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Limite</Label>
            <Input type="number" min={0} value={novoLimite} onChange={(e) => setNovoLimite(e.target.value)} placeholder="Ex: 3" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observação (opcional)</Label>
            <Input value={novaObs} onChange={(e) => setNovaObs(e.target.value)} placeholder="Ex: feriado municipal" />
          </div>
          <Button onClick={handleAdd} disabled={upsert.isPending}>
            <Save className="size-4 mr-2" /> Adicionar
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Data</TableHead>
                <TableHead className="w-32">Limite</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dias.isLoading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
              )}
              {!dias.isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma configuração futura cadastrada.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      defaultValue={r.limite_folgas}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== r.limite_folgas) handleUpdateRow(r, "limite_folgas", e.target.value);
                      }}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={r.observacao ?? ""}
                      onBlur={(e) => {
                        if ((e.target.value || null) !== r.observacao) handleUpdateRow(r, "observacao", e.target.value);
                      }}
                      className="h-8"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(r)} className="size-8">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DpContentCard>

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="size-5 text-primary" /> Bloqueios e restrições</CardTitle>
            <CardDescription>Datas bloqueadas, regras recorrentes e feriados sem folga.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/dp/bloqueios">Abrir gestão de bloqueios</Link>
            </Button>
          </CardContent>
        </Card>

        <PrazosLembretesCard />
      </div>


      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover configuração desta data?</AlertDialogTitle>
            <AlertDialogDescription>
              O dia voltará a seguir o limite padrão calculado automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) { del.mutate(toDelete.id); setToDelete(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}

const PRAZO_FIELDS: Array<{
  key: keyof DpPendenciasConfig;
  label: string;
  helper: string;
  min: number;
  max: number;
}> = [
  { key: "alerta_solicitacao_dias", label: "Solicitações (dias para responder)", helper: "Dias após a criação da solicitação até virar pendência atrasada.", min: 1, max: 30 },
  { key: "alerta_troca_dias", label: "Trocas (dias para aprovação do gestor)", helper: "Dias após a criação da troca até virar pendência atrasada.", min: 1, max: 30 },
  { key: "alerta_contracheque_dia_mes", label: "Contracheque (dia limite do mês)", helper: "A partir desse dia do mês, cobra o contracheque do mês anterior por unidade.", min: 1, max: 31 },
  { key: "alerta_adiantamento_offset", label: "Adiantamento (dias após o dia de pagamento)", helper: "Somado ao 'dia_adiantamento' da unidade. Ex.: 5 → cobra 5 dias após.", min: 1, max: 31 },
  { key: "alerta_folha_ponto_dia_mes", label: "Folha de ponto (dia limite do mês)", helper: "A partir desse dia do mês, cobra a folha de ponto do mês anterior por unidade com relógio.", min: 1, max: 31 },
  { key: "alerta_negociacao_dias", label: "Negociação coletiva (dias antes do vencimento)", helper: "Janela para começar a alertar antes do vencimento anual da última negociação.", min: 1, max: 180 },
];

function PrazosLembretesCard() {
  const { config, save, saving, isLoading } = useDpPendenciasConfig();
  const [form, setForm] = useState<DpPendenciasConfig>(DP_PENDENCIAS_CONFIG_DEFAULT);

  useEffect(() => {
    if (!isLoading) setForm(config);
  }, [isLoading, config]);

  const handleSave = () => {
    for (const f of PRAZO_FIELDS) {
      const v = Number(form[f.key]);
      if (!Number.isFinite(v) || v < f.min || v > f.max) {
        return toast.error(`Valor inválido em "${f.label}"`, {
          description: `Use um número entre ${f.min} e ${f.max}.`,
        });
      }
    }
    save(form, {
      onSuccess: () => toast.success("Prazos de lembrete atualizados"),
      onError: (e: any) => toast.error("Erro ao salvar", { description: e?.message ?? String(e) }),
    } as any);
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-5 text-primary" /> Prazos de lembrete das pendências
        </CardTitle>
        <CardDescription>
          Configure, por tipo de atividade, o prazo usado no Painel Administrativo para gerar as pendências do sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {PRAZO_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-xs">{f.label}</Label>
            <Input
              type="number"
              min={f.min}
              max={f.max}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">{f.helper}</p>
          </div>
        ))}
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={handleSave} disabled={saving || isLoading}>
            <Save className="size-4 mr-2" /> Salvar prazos
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

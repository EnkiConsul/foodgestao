import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { CalendarDays, Loader2, Shuffle, ShieldAlert, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FolgaCalendar, type FolgaCell } from "@/components/dp/FolgaCalendar";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";

export default function DpAdminCalendario() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const today = new Date();
  const [ano, setAno] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ colaborador_id: "", extra: false });
  const [limiteForm, setLimiteForm] = useState<number>(0);

  const range = useMemo(() => {
    const start = startOfMonth(new Date(ano, mes - 1, 1));
    const end = endOfMonth(start);
    return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
  }, [ano, mes]);

  const folgasQuery = useQuery({
    queryKey: ["dp_folgas_admin", selectedCompanyId, ano, mes],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folgas")
        .select("id, data, colaborador_id, status, tipo, extra, origem, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .gte("data", range.start).lte("data", range.end);
      if (error) throw error;
      return (data ?? []).map((f: any) => ({
        id: f.id, data: f.data, colaborador_id: f.colaborador_id,
        colaborador_nome: f.dp_colaboradores?.nome, status: f.status,
        tipo: f.tipo, extra: f.extra, origem: f.origem,
      })) as FolgaCell[];
    },
  });

  const bloqueiosQuery = useQuery({
    queryKey: ["dp_datas_bloqueadas", selectedCompanyId, ano, mes],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_datas_bloqueadas")
        .select("data, motivo")
        .eq("company_id", selectedCompanyId!)
        .gte("data", range.start).lte("data", range.end);
      if (error) throw error;
      return data ?? [];
    },
  });

  const diaConfigQuery = useQuery({
    queryKey: ["dp_dia_config", selectedCompanyId, ano, mes],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_dia_config")
        .select("data, limite_folgas")
        .eq("company_id", selectedCompanyId!)
        .is("unidade_id", null)
        .gte("data", range.start).lte("data", range.end);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.data as string] = r.limite_folgas as number;
      return map;
    },
  });

  const sortear = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("dp-sorteio-folgas", {
        body: { company_id: selectedCompanyId!, ano, mes, regenerar_prioridades: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Sorteio concluído: ${data?.inseridas ?? 0} folgas inseridas`);
      if (data?.ignoradas?.length) {
        toast.info(`${data.ignoradas.length} ignoradas (limites/bloqueios)`);
      }
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro no sorteio"),
  });

  const gerarBloqueios = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("dp_gerar_bloqueios_ano", {
        _company_id: selectedCompanyId!, _ano: ano,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      toast.success(`${n ?? 0} datas bloqueadas geradas para ${ano}`);
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const atribuirFolga = useMutation({
    mutationFn: async () => {
      if (!dayOpen || !assignForm.colaborador_id) throw new Error("Selecione colaborador");
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_folgas").insert({
        company_id: selectedCompanyId!,
        colaborador_id: assignForm.colaborador_id,
        data: dayOpen, tipo: "normal", origem: "admin_manual",
        status: "agendada", extra: assignForm.extra,
        criado_por: userRes.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folga atribuída");
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
      setDayOpen(null);
      setAssignForm({ colaborador_id: "", extra: false });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const removerFolga = useMutation({
    mutationFn: async (folgaId: string) => {
      const { error } = await supabase.from("dp_folgas").delete().eq("id", folgaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folga removida");
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const salvarLimite = useMutation({
    mutationFn: async () => {
      if (!dayOpen) return;
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_dia_config").upsert({
        company_id: selectedCompanyId!,
        data: dayOpen,
        limite_folgas: limiteForm,
        criado_por: userRes.user?.id ?? null,
      }, { onConflict: "company_id,unidade_id,data" }).select();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limite atualizado");
      qc.invalidateQueries({ queryKey: ["dp_dia_config"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const openDay = (data: string) => {
    setDayOpen(data);
    setLimiteForm(diaConfigQuery.data?.[data] ?? 0);
  };

  const dayFolgas = (folgasQuery.data ?? []).filter((f) => f.data === dayOpen);

  return (
    <DpPage>
      <Helmet><title>Calendário de folgas — DP 360°</title></Helmet>
      <DpPageHeader
        icon={CalendarDays}
        title="Calendário de folgas"
        description="Sorteio automático, atribuição manual e limites por dia."
        actions={
          <>
          <Button variant="outline" onClick={() => gerarBloqueios.mutate()} disabled={gerarBloqueios.isPending}>
            <ShieldAlert className="h-4 w-4 mr-1" /> Gerar bloqueios do ano
          </Button>
          <Button onClick={() => sortear.mutate()} disabled={sortear.isPending}>
            {sortear.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Shuffle className="h-4 w-4 mr-1" />}
            Sortear folgas do mês
          </Button>
          </>
        }
      />

      <DpContentCard contentClassName="p-4 md:p-6">
          <FolgaCalendar
            ano={ano} mes={mes}
            folgas={folgasQuery.data ?? []}
            datasBloqueadas={bloqueiosQuery.data ?? []}
            diaConfigLimite={diaConfigQuery.data ?? {}}
            onChangeMonth={(a, m) => { setAno(a); setMes(m); }}
            onDayClick={openDay}
          />
      </DpContentCard>

      <Dialog open={!!dayOpen} onOpenChange={(o) => !o && setDayOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dia {dayOpen && format(new Date(dayOpen + "T12:00:00"), "dd/MM/yyyy")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Folgas atuais</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {dayFolgas.length === 0 ? (
                  <p className="text-muted-foreground">Nenhuma folga marcada.</p>
                ) : dayFolgas.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.colaborador_nome} <span className="text-xs text-muted-foreground">({f.origem})</span></span>
                    <div className="flex items-center gap-1 shrink-0">
                      {f.extra && <span className="text-[10px] rounded bg-accent px-1">extra</span>}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Remover folga"
                        disabled={removerFolga.isPending}
                        onClick={() => removerFolga.mutate(f.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label className="text-sm">Atribuir folga</Label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Select value={assignForm.colaborador_id} onValueChange={(v) => setAssignForm({ ...assignForm, colaborador_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Colaborador" /></SelectTrigger>
                  <SelectContent>
                    {(colabs.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 border rounded px-3">
                  <Switch checked={assignForm.extra} onCheckedChange={(v) => setAssignForm({ ...assignForm, extra: v })} />
                  <Label className="text-xs">Extra</Label>
                </div>
              </div>
              <Button size="sm" onClick={() => atribuirFolga.mutate()} disabled={atribuirFolga.isPending || !assignForm.colaborador_id}>
                Atribuir
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Limite de folgas neste dia</Label>
              <div className="flex gap-2">
                <Input type="number" min={0} value={limiteForm}
                  onChange={(e) => setLimiteForm(parseInt(e.target.value || "0", 10))} />
                <Button size="sm" variant="outline" onClick={() => salvarLimite.mutate()} disabled={salvarLimite.isPending}>
                  Salvar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">0 = sem limite configurado (livre).</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDayOpen(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}

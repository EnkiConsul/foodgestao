import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, ClipboardList, CalendarIcon, Ban, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { cn } from "@/lib/utils";
import { useDpRegrasColaborador } from "@/hooks/useDpRegrasColaborador";
import { resumoEscolhaFolgas } from "@/lib/dp/dsr-rules";

import { calculateDateStatus, type ColaboradorRecord, type FolgaRecord } from "@/lib/dp/folga-rules";
import { buildBloqueiosDeRegras, type RegraRow } from "@/lib/dp/bloqueio-rules";

const TIPOS = [
  { value: "folga", label: "Folga" },
  { value: "adiantamento", label: "Adiantamento" },
  { value: "atestado", label: "Atestado" },
  { value: "ferias", label: "Férias" },
  { value: "outro", label: "Outro" },
];

const statusColor: Record<string, string> = {
  pendente: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  aprovada: "bg-green-500/10 text-green-700 dark:text-green-300",
  recusada: "bg-red-500/10 text-red-700 dark:text-red-300",
  cancelada: "bg-muted text-muted-foreground",
};

const STATUS_TABS = ["todas", "pendente", "aprovada", "recusada", "cancelada"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

function toIso(d: Date | undefined): string {
  return d ? format(d, "yyyy-MM-dd") : "";
}

export default function DpMeuSolicitacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<StatusTab>("todas");
  const [form, setForm] = useState<{
    tipo: string;
    data_alvo: Date | undefined;
    data_fim: Date | undefined;
    motivo: string;
  }>({ tipo: "folga", data_alvo: undefined, data_fim: undefined, motivo: "" });

  // Pré-preenche a data quando chega via ?data=YYYY-MM-DD (vindo do calendário).
  useEffect(() => {
    const iso = params.get("data");
    if (!iso) return;
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return;
    setForm((f) => ({ ...f, data_alvo: new Date(y, m - 1, d) }));
    setOpen(true);
    params.delete("data");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meRef = useQuery({
    queryKey: ["colab_of_sol", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!data) return null;
      const { data: c } = await supabase
        .from("dp_colaboradores")
        .select("id, company_id, unidade_id, sexo, domingos_folga_mes, folga_fixa_semana, ativo, nome")
        .eq("id", data)
        .single();
      return c;
    },
  });

  const list = useQuery({
    queryKey: ["dp_meu_sol", meRef.data?.id],
    enabled: !!meRef.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_solicitacoes").select("*")
        .eq("colaborador_id", meRef.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Datas bloqueadas para alertar antes do envio.
  const bloqueios = useQuery({
    queryKey: ["dp_bloqueios_meu_sol", meRef.data?.company_id],
    enabled: !!meRef.data?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_datas_bloqueadas").select("data, motivo, liberada_por_solicitacao, unidade_id")
        .eq("company_id", meRef.data!.company_id!);
      return data ?? [];
    },
  });

  const regrasBloqueio = useQuery({
    queryKey: ["dp_bloq_regras_meu_sol", meRef.data?.company_id],
    enabled: !!meRef.data?.company_id,
    queryFn: async () => {
      const [{ data: regras }, { data: vinc }] = await Promise.all([
        supabase
          .from("dp_bloqueio_regras")
          .select("id, company_id, nome, tipo, mes, dia, regra_json, ativo")
          .eq("company_id", meRef.data!.company_id!)
          .eq("ativo", true),
        supabase.from("dp_bloqueio_regra_unidades").select("regra_id, unidade_id"),
      ]);
      return {
        regras: (regras ?? []) as RegraRow[],
        vinculos: (vinc ?? []) as { regra_id: string; unidade_id: string }[],
      };
    },
  });

  const { config: regrasConfig, diasElegiveis, tetoMensal } = useDpRegrasColaborador(meRef.data?.company_id ?? null, meRef.data?.unidade_id ?? null, (meRef.data as { sexo?: string | null } | undefined)?.sexo ?? null, (meRef.data as { domingos_folga_mes?: number | null } | undefined)?.domingos_folga_mes ?? null);
  const resumoFolgas = resumoEscolhaFolgas(regrasConfig, { sexo: (meRef.data as { sexo?: string | null } | undefined)?.sexo ?? null });

  const dataAlvoIso = toIso(form.data_alvo);
  const bloqueioAtivo = useMemo(() => {
    // 1) bloqueio pontual em dp_datas_bloqueadas
    const row = (bloqueios.data ?? []).find(
      (b: any) =>
        b.data === dataAlvoIso &&
        (b.unidade_id === null || b.unidade_id === meRef.data?.unidade_id) &&
        !b.liberada_por_solicitacao,
    );
    if (row) return ((row as any).motivo as string) ?? "";
    // 2) regra dinâmica (runtime), se houver liberação individual, não bloqueia
    if (!dataAlvoIso || !form.data_alvo || !regrasBloqueio.data) return null;
    const liberada = (bloqueios.data ?? []).some(
      (b: any) =>
        b.data === dataAlvoIso &&
        (b.unidade_id === null || b.unidade_id === meRef.data?.unidade_id) &&
        !!b.liberada_por_solicitacao,
    );
    if (liberada) return null;
    const map = buildBloqueiosDeRegras({
      regras: regrasBloqueio.data.regras,
      vinculos: regrasBloqueio.data.vinculos,
      unidadeId: meRef.data?.unidade_id ?? null,
      from: form.data_alvo,
      to: form.data_alvo,
    });
    return map.get(dataAlvoIso) ?? null;
  }, [bloqueios.data, dataAlvoIso, form.data_alvo, meRef.data?.unidade_id, regrasBloqueio.data]);

  // Capacidade do dia (só relevante quando tipo = folga)
  const capacity = useQuery({
    queryKey: ["dp_meu_sol_cap", meRef.data?.company_id, dataAlvoIso],
    enabled: !!meRef.data?.company_id && !!dataAlvoIso && form.tipo === "folga",
    queryFn: async () => {
      const companyId = meRef.data!.company_id!;
      const [colabsRes, folgasRes, pendRes, diaCfgRes] = await Promise.all([
        supabase
          .from("dp_colaboradores")
          .select("id, nome, folga_fixa_semana, ativo, unidade_id")
          .eq("company_id", companyId),
        supabase
          .from("dp_folgas")
          .select("id, data, colaborador_id, tipo, extra, status")
          .eq("company_id", companyId)
          .eq("data", dataAlvoIso),
        supabase
          .from("dp_solicitacoes")
          .select("id, colaborador_id, data_alvo")
          .eq("company_id", companyId)
          .eq("tipo", "folga")
          .eq("status", "pendente")
          .eq("data_alvo", dataAlvoIso),
        supabase
          .from("dp_dia_config")
          .select("data, limite_folgas, unidade_id")
          .eq("company_id", companyId)
          .eq("data", dataAlvoIso),
      ]);
      return {
        colaboradores: (colabsRes.data ?? []) as ColaboradorRecord[],
        folgas: (folgasRes.data ?? []) as any[],
        pendentes: (pendRes.data ?? []) as any[],
        diaCfg: (diaCfgRes.data ?? []) as any[],
      };
    },
  });

  const dateStatus = useMemo(() => {
    if (!form.data_alvo || form.tipo !== "folga" || !capacity.data || !meRef.data) return null;
    const myUnidade = meRef.data.unidade_id ?? null;
    // Filtra limite priorizando unidade específica
    const dayLimits = new Map<string, number>();
    const rows = capacity.data.diaCfg
      .filter((r: any) => r.unidade_id === null || r.unidade_id === myUnidade)
      .sort((a: any, b: any) => (b.unidade_id ? 1 : 0) - (a.unidade_id ? 1 : 0));
    if (rows[0]) dayLimits.set(rows[0].data, rows[0].limite_folgas);

    const manualBlocked = new Map<string, { reason: string; liberada: boolean }>();
    for (const b of bloqueios.data ?? []) {
      if ((b as any).unidade_id === null || (b as any).unidade_id === myUnidade) {
        manualBlocked.set((b as any).data, {
          reason: (b as any).motivo ?? "",
          liberada: !!(b as any).liberada_por_solicitacao,
        });
      }
    }

    const allFolgas: FolgaRecord[] = capacity.data.folgas.map((f: any) => ({
      colaborador_id: f.colaborador_id,
      data: f.data,
      tipo: f.tipo,
      extra: !!f.extra,
    }));

    return calculateDateStatus({
      date: form.data_alvo,
      myColaboradorId: meRef.data.id,
      allFolgas,
      allColaboradores: capacity.data.colaboradores,
      manualBlocked,
      dayLimits,
      pendingRequests: capacity.data.pendentes.map((p: any) => ({
        data: p.data_alvo,
        colaborador_id: p.colaborador_id,
      })),
      isAdmin: false,
      diasElegiveis,
      tetoMensal,
    });
  }, [form.data_alvo, form.tipo, capacity.data, meRef.data, bloqueios.data, diasElegiveis, tetoMensal]);

  // Validação
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!form.data_alvo) errors.push("Informe a data.");
    if (form.data_fim && form.data_alvo && form.data_fim < form.data_alvo)
      errors.push("A data fim não pode ser anterior à data inicial.");
    if (form.tipo !== "folga" && !form.motivo.trim())
      errors.push("Motivo obrigatório para este tipo de solicitação.");
    if (form.tipo === "folga" && dateStatus) {
      if (dateStatus.status === "taken") {
        errors.push(
          `Data indisponível. Limite de folgas atingido (${dateStatus.occupancy ?? "?"}/${dateStatus.limit ?? "?"}).`,
        );
      } else if (dateStatus.status === "blocked") {
        errors.push(`Esta data está bloqueada pelo DP${dateStatus.reason ? `: ${dateStatus.reason}` : ""}.`);
      } else if (dateStatus.status === "past") {
        errors.push("Não é possível solicitar folga em data passada.");
      }
    }
    return errors;
  }, [form, dateStatus]);

  const create = useMutation({
    mutationFn: async () => {
      if (!meRef.data) throw new Error("Colaborador não encontrado");
      if (validation.length) throw new Error(validation[0]);
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: meRef.data.company_id,
        colaborador_id: meRef.data.id,
        tipo: form.tipo as any,
        data_alvo: toIso(form.data_alvo) || null,
        data_fim: toIso(form.data_fim) || null,
        motivo: form.motivo || null,
        criado_por: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação enviada");
      qc.invalidateQueries({ queryKey: ["dp_meu_sol"] });
      setOpen(false);
      setForm({ tipo: "folga", data_alvo: undefined, data_fim: undefined, motivo: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("dp_solicitacoes")
        .update({ status: "cancelada" as any })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação cancelada");
      qc.invalidateQueries({ queryKey: ["dp_meu_sol"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const filtered = useMemo(() => {
    if (tab === "todas") return list.data ?? [];
    return (list.data ?? []).filter((s: any) => s.status === tab);
  }, [list.data, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: list.data?.length ?? 0 };
    for (const s of list.data ?? []) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [list.data]);

  return (
    <DpPage>
      <Helmet><title>Minhas solicitações — Portal</title></Helmet>
      <DpPageHeader
        icon={ClipboardList}
        title="Minhas solicitações"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Nova solicitação</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <DateField label="Data" value={form.data_alvo} onChange={(d) => setForm({ ...form, data_alvo: d })} />
                  <DateField label="Data fim" value={form.data_fim} onChange={(d) => setForm({ ...form, data_fim: d })} />
                </div>
                {form.tipo === "folga" && (
                  <p className="text-xs text-muted-foreground">{resumoFolgas.texto}</p>
                )}

                {bloqueioAtivo != null && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>
                      Esta data está bloqueada pelo DP{bloqueioAtivo ? `: ${bloqueioAtivo}` : ""}.
                    </p>
                  </div>
                )}
                {form.tipo === "folga" && dateStatus && dateStatus.status === "taken" && (
                  <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-900">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>
                      Data indisponível. Limite de folgas atingido ({dateStatus.occupancy ?? 0}/{dateStatus.limit ?? 0}).
                    </p>
                  </div>
                )}
                {form.tipo === "folga" && dateStatus && dateStatus.status === "available" && dateStatus.limit != null && (
                  <p className="text-xs text-muted-foreground">
                    Vagas disponíveis nesta data: {(dateStatus.limit ?? 0) - (dateStatus.occupancy ?? 0)} de {dateStatus.limit}.
                  </p>
                )}
                <div>
                  <Label>Motivo{form.tipo !== "folga" && <span className="text-destructive ml-0.5">*</span>}</Label>
                  <Textarea rows={3} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
                </div>
                {validation.length > 0 && (
                  <p className="text-xs text-destructive">{validation[0]}</p>
                )}
              </div>
              <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} className="min-h-10 w-full sm:w-auto">Cancelar</Button>
                <Button
                  disabled={create.isPending || validation.length > 0}
                  onClick={() => create.mutate()}
                  className="min-h-10 w-full sm:w-auto"
                >
                  Enviar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
        <div className="-mx-1 overflow-x-auto">
          <TabsList className="w-max">
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize whitespace-nowrap">
                {s} <span className="ml-1 text-[10px] opacity-70">({counts[s] ?? 0})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {filtered.length === 0 ? (
        <DpContentCard><DpEmptyState icon={ClipboardList}>Sem solicitações.</DpEmptyState></DpContentCard>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s: any) => (
            <Card key={s.id} className="dp-content-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base capitalize">{s.tipo}</CardTitle>
                  <Badge className={statusColor[s.status]}>{s.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.data_alvo && format(new Date(s.data_alvo + "T00:00:00"), "dd/MM/yyyy")}
                  {s.data_fim && ` – ${format(new Date(s.data_fim + "T00:00:00"), "dd/MM/yyyy")}`}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.motivo && <p className="text-sm">{s.motivo}</p>}
                {s.resposta_admin && (
                  <p className="text-xs text-muted-foreground">Resposta: {s.resposta_admin}</p>
                )}
                {s.status === "pendente" && (
                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelar.mutate(s.id)}
                      disabled={cancelar.isPending}
                    >
                      <Ban className="h-4 w-4 mr-1" /> Cancelar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DpPage>
  );
}

function DateField({
  label, value, onChange,
}: { label: string; value: Date | undefined; onChange: (d: Date | undefined) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
          >
            <CalendarIcon className="h-4 w-4 mr-2" />
            {value ? format(value, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecionar</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

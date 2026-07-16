import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Repeat, Check, X, Ban, Plus, ArrowRight, User, Users, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { cn } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  pendente_colega: "Aguardando colega",
  pendente_gestor: "Aguardando gestor",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

const statusTone: Record<string, string> = {
  pendente_colega: "bg-amber-500/10 text-amber-700 border-amber-300",
  pendente_gestor: "bg-blue-500/10 text-blue-700 border-blue-300",
  aprovada: "bg-green-500/10 text-green-700 border-green-300",
  recusada: "bg-red-500/10 text-red-700 border-red-300",
  cancelada: "bg-muted text-muted-foreground border-transparent",
};

function toIso(d: Date | undefined) {
  return d ? format(d, "yyyy-MM-dd") : "";
}

export default function DpMeuTrocas() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"todas" | "recebidas" | "enviadas">("todas");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    destino_id: string;
    data_original: Date | undefined;
    data_proposta: Date | undefined;
    motivo: string;
  }>({ destino_id: "", data_original: undefined, data_proposta: undefined, motivo: "" });

  const meRef = useQuery({
    queryKey: ["colab_of_trocas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!data) return null;
      const { data: c } = await supabase
        .from("dp_colaboradores").select("id, company_id").eq("id", data).single();
      return c;
    },
  });

  const list = useQuery({
    queryKey: ["dp_meu_trocas", meRef.data?.id],
    enabled: !!meRef.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_trocas")
        .select("*, solicitante:solicitante_id(nome), destino:destino_id(nome)")
        .or(`solicitante_id.eq.${meRef.data!.id},destino_id.eq.${meRef.data!.id}`)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Colegas elegíveis (mesma empresa, exceto eu mesmo).
  const colegas = useQuery({
    queryKey: ["dp_colegas_trocas", meRef.data?.company_id, meRef.data?.id],
    enabled: !!meRef.data?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_colaboradores")
        .select("id, nome")
        .eq("company_id", meRef.data!.company_id!)
        .eq("ativo", true)
        .neq("id", meRef.data!.id)
        .order("nome");
      return data ?? [];
    },
  });

  const responderColega = useMutation({
    mutationFn: async ({ id, aceito }: { id: string; aceito: boolean }) => {
      const { error } = await supabase.from("dp_trocas").update({
        colega_resposta: aceito ? "aprovada" : "recusada",
        colega_respondido_em: new Date().toISOString(),
        status: aceito ? "pendente_gestor" : "recusada",
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resposta registrada");
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_trocas").update({ status: "cancelada" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Troca cancelada");
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const validation = useMemo(() => {
    if (!form.destino_id) return "Selecione um colega.";
    if (!form.data_original) return "Informe a data que deseja trocar.";
    if (!form.data_proposta) return "Informe a data proposta.";
    if (toIso(form.data_original) === toIso(form.data_proposta))
      return "As datas devem ser diferentes.";
    if (!form.motivo.trim()) return "Motivo obrigatório.";
    return null;
  }, [form]);

  const criar = useMutation({
    mutationFn: async () => {
      if (!meRef.data) throw new Error("Colaborador não encontrado");
      if (validation) throw new Error(validation);
      const { error } = await supabase.from("dp_trocas").insert({
        company_id: meRef.data.company_id,
        solicitante_id: meRef.data.id,
        destino_id: form.destino_id,
        data_original: toIso(form.data_original),
        data_proposta: toIso(form.data_proposta),
        motivo: form.motivo,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Troca proposta enviada");
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
      setOpen(false);
      setForm({ destino_id: "", data_original: undefined, data_proposta: undefined, motivo: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const filtered = useMemo(() => {
    const meId = meRef.data?.id;
    const src = list.data ?? [];
    if (tab === "recebidas") return src.filter((t: any) => t.destino_id === meId);
    if (tab === "enviadas") return src.filter((t: any) => t.solicitante_id === meId);
    return src;
  }, [list.data, tab, meRef.data?.id]);

  const counts = useMemo(() => {
    const meId = meRef.data?.id;
    const src = list.data ?? [];
    return {
      todas: src.length,
      recebidas: src.filter((t: any) => t.destino_id === meId).length,
      enviadas: src.filter((t: any) => t.solicitante_id === meId).length,
    };
  }, [list.data, meRef.data?.id]);

  return (
    <DpPage>
      <Helmet><title>Minhas trocas — Portal</title></Helmet>
      <DpPageHeader
        icon={Repeat}
        title="Minhas trocas"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Propor troca</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Nova proposta de troca</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Colega</Label>
                  <Select value={form.destino_id} onValueChange={(v) => setForm({ ...form, destino_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar colega" /></SelectTrigger>
                    <SelectContent>
                      {(colegas.data ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <DateField label="Minha data" value={form.data_original} onChange={(d) => setForm({ ...form, data_original: d })} />
                  <DateField label="Data proposta" value={form.data_proposta} onChange={(d) => setForm({ ...form, data_proposta: d })} />
                </div>
                <div>
                  <Label>Motivo<span className="text-destructive ml-0.5">*</span></Label>
                  <Textarea rows={3} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
                </div>
                {validation && <p className="text-xs text-destructive">{validation}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button disabled={criar.isPending || !!validation} onClick={() => criar.mutate()}>Enviar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="todas">Todas ({counts.todas})</TabsTrigger>
          <TabsTrigger value="recebidas"><Users className="h-3.5 w-3.5 mr-1" /> Recebidas ({counts.recebidas})</TabsTrigger>
          <TabsTrigger value="enviadas"><User className="h-3.5 w-3.5 mr-1" /> Enviadas ({counts.enviadas})</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <DpContentCard><DpEmptyState icon={Repeat}>Sem trocas.</DpEmptyState></DpContentCard>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t: any) => {
            const meId = meRef.data?.id;
            const souDestino = t.destino_id === meId;
            const souSolicitante = t.solicitante_id === meId;
            const podeResponderColega = souDestino && t.status === "pendente_colega";
            const podeCancelar = souSolicitante && ["pendente_colega", "pendente_gestor"].includes(t.status);
            return (
              <Card key={t.id} className="dp-content-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      {t.solicitante?.nome} <ArrowRight className="h-4 w-4 text-muted-foreground" /> {t.destino?.nome}
                    </CardTitle>
                    <Badge variant="outline" className={cn("border", statusTone[t.status])}>
                      {statusLabel[t.status] ?? t.status}
                    </Badge>
                  </div>
                  {/* Fluxo colega → gestor */}
                  <div className="flex items-center gap-1 mt-1 text-[11px]">
                    <StepBadge label="Colega" state={
                      t.colega_resposta === "aprovada" ? "ok"
                      : t.colega_resposta === "recusada" ? "no"
                      : t.status === "pendente_colega" ? "cur" : "wait"
                    } />
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <StepBadge label="Gestor" state={
                      t.gestor_resposta === "aprovada" ? "ok"
                      : t.gestor_resposta === "recusada" ? "no"
                      : t.status === "pendente_gestor" ? "cur" : "wait"
                    } />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(t.data_original + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                    {" ↔ "}
                    {format(new Date(t.data_proposta + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">{t.motivo}</p>
                  {(podeResponderColega || podeCancelar) && (
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {podeResponderColega && (
                        <>
                          <Button size="sm" onClick={() => responderColega.mutate({ id: t.id, aceito: true })}
                            disabled={responderColega.isPending}>
                            <Check className="h-4 w-4 mr-1" /> Aceitar
                          </Button>
                          <Button size="sm" variant="outline"
                            onClick={() => responderColega.mutate({ id: t.id, aceito: false })}
                            disabled={responderColega.isPending}>
                            <X className="h-4 w-4 mr-1" /> Recusar
                          </Button>
                        </>
                      )}
                      {podeCancelar && (
                        <Button size="sm" variant="ghost"
                          onClick={() => cancelar.mutate(t.id)} disabled={cancelar.isPending}>
                          <Ban className="h-4 w-4 mr-1" /> Cancelar
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </DpPage>
  );
}

function StepBadge({ label, state }: { label: string; state: "ok" | "no" | "cur" | "wait" }) {
  const cls =
    state === "ok" ? "bg-green-500/15 text-green-700 border-green-300"
    : state === "no" ? "bg-red-500/15 text-red-700 border-red-300"
    : state === "cur" ? "bg-primary/15 text-primary border-primary/40 ring-1 ring-primary/30"
    : "bg-muted text-muted-foreground border-transparent";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5", cls)}>{label}</span>
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

import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Palmtree, Plus, CheckCircle2 } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpMinhasFerias, type MinhaFeriasPeriodo } from "@/hooks/useDpMinhasFerias";

const fmt = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });

const STATUS_LABEL: Record<string, string> = {
  planejado: "Aguardando aprovação",
  aprovado: "Programada",
  em_gozo: "Em férias",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

const STATUS_TONE: Record<string, string> = {
  planejado: "bg-amber-500/15 text-amber-600",
  aprovado: "bg-sky-500/15 text-sky-600",
  em_gozo: "bg-primary/15 text-primary",
  concluido: "bg-muted text-muted-foreground",
  cancelado: "bg-destructive/15 text-destructive",
};

/** Minhas Férias: saldo, pedidos e ciência das férias programadas. */
export default function DpMeuFerias() {
  const { periodos, isLoading, isError, refetch, solicitar, registrarCiencia } = useDpMinhasFerias();
  const [aberto, setAberto] = useState(false);
  const [periodoId, setPeriodoId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [abono, setAbono] = useState(0);
  const [adiantar13, setAdiantar13] = useState(false);
  const [observacao, setObservacao] = useState("");

  const comSaldo = useMemo(() => periodos.filter((p) => p.dias_saldo > 0), [periodos]);
  const periodoSel: MinhaFeriasPeriodo | null =
    comSaldo.find((p) => p.periodo_id === periodoId) ?? null;

  const dias = inicio && fim ? differenceInCalendarDays(parseISO(fim), parseISO(inicio)) + 1 : 0;
  const total = dias + (Number(abono) || 0);
  const excede = !!periodoSel && total > periodoSel.dias_saldo;
  const antecedencia = inicio ? differenceInCalendarDays(parseISO(inicio), new Date()) : null;
  const foraDoPrazo =
    !!periodoSel && antecedencia !== null && antecedencia < periodoSel.aviso_antecedencia_dias;

  const abrir = () => {
    setPeriodoId(comSaldo[0]?.periodo_id ?? "");
    setInicio("");
    setFim("");
    setAbono(0);
    setAdiantar13(false);
    setObservacao("");
    setAberto(true);
  };

  const definirInicio = (v: string) => {
    setInicio(v);
    if (v && (!fim || fim < v)) setFim(format(addDays(parseISO(v), 29), "yyyy-MM-dd"));
  };

  return (
    <DpPage>
      <Helmet><title>Minhas Férias — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={Palmtree}
        title="Minhas Férias"
        description="Seu saldo de férias, os pedidos enviados e as férias já programadas."
        actions={
          <Button className="rounded-full px-6" disabled={comSaldo.length === 0} onClick={abrir}>
            <Plus className="mr-2 size-4" /> Pedir férias
          </Button>
        }
      />

      {isError ? (
        <DpContentCard contentClassName="p-4"><DpErrorState onRetry={refetch} /></DpContentCard>
      ) : isLoading ? (
        <DpContentCard contentClassName="p-8 text-center text-muted-foreground">
          Carregando…
        </DpContentCard>
      ) : periodos.length === 0 ? (
        <DpContentCard contentClassName="p-8 text-center text-muted-foreground">
          Ainda não há períodos de férias registrados para você.
        </DpContentCard>
      ) : (
        <div className="space-y-4">
          {periodos.map((p) => (
            <DpContentCard key={p.periodo_id} contentClassName="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    Período {fmt(p.inicio_aquisitivo)} a {fmt(p.fim_aquisitivo)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Prazo para tirar: até {fmt(p.limite_concessivo)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Direito {p.dias_direito} dias</Badge>
                  <Badge variant="outline">Saldo {p.dias_saldo} dias</Badge>
                </div>
              </div>

              {p.gozos.length > 0 && (
                <div className="space-y-2 rounded-xl bg-muted/40 p-3">
                  {p.gozos.map((g) => (
                    <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        {fmt(g.data_inicio)} a {fmt(g.data_fim)} · {g.dias} dias
                        {g.dias_abono > 0 && ` + ${g.dias_abono} de abono`}
                        {g.adiantar_13 && " · 13º adiantado"}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge className={STATUS_TONE[g.status]}>
                          {STATUS_LABEL[g.status] ?? g.status}
                        </Badge>
                        {g.ciente_em ? (
                          <Badge variant="outline" className="text-emerald-600">
                            <CheckCircle2 className="mr-1 size-3.5" /> Ciente
                          </Badge>
                        ) : (
                          (g.status === "aprovado" || g.status === "em_gozo") && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={registrarCiencia.isPending}
                              onClick={() => registrarCiencia.mutate(g.id)}
                            >
                              Estou ciente
                            </Button>
                          )
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </DpContentCard>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pedir férias</DialogTitle>
            <DialogDescription>
              Seu pedido vai para a aprovação do gestor antes de virar férias programadas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Período</Label>
              <Select value={periodoId} onValueChange={setPeriodoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o período" /></SelectTrigger>
                <SelectContent>
                  {comSaldo.map((p) => (
                    <SelectItem key={p.periodo_id} value={p.periodo_id}>
                      {fmt(p.inicio_aquisitivo)} a {fmt(p.fim_aquisitivo)} · saldo {p.dias_saldo} dias
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input type="date" value={inicio} onChange={(e) => definirInicio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input
                  type="date"
                  min={inicio || undefined}
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vender dias (abono)</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={abono}
                onChange={(e) => setAbono(Number(e.target.value) || 0)}
              />
            </div>

            {periodoSel?.adiantamento_13 !== "nao" && (
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Adiantar a 1ª parcela do 13º</p>
                  <p className="text-xs text-muted-foreground">
                    Sujeito à conferência do setor de pessoal.
                  </p>
                </div>
                <Switch checked={adiantar13} onCheckedChange={setAdiantar13} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>

            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <span className="font-semibold">{dias}</span> dias de férias
              {abono > 0 && <> + <span className="font-semibold">{abono}</span> vendidos</>} ={" "}
              <span className="font-semibold">{total}</span> dias do período.
              {excede && (
                <p className="mt-1 text-destructive">
                  Passa do seu saldo ({periodoSel?.dias_saldo} dias).
                </p>
              )}
              {foraDoPrazo && !excede && (
                <p className="mt-1 text-amber-700">
                  A empresa pede {periodoSel?.aviso_antecedencia_dias} dias de antecedência. Seu
                  pedido pode ser recusado por estar em cima da hora.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button
              disabled={solicitar.isPending || excede || !periodoId || !inicio || !fim}
              onClick={() =>
                solicitar.mutate(
                  {
                    periodoId,
                    dataInicio: inicio,
                    dataFim: fim,
                    diasAbono: Number(abono) || 0,
                    adiantar13,
                    observacao,
                  },
                  { onSuccess: () => setAberto(false) },
                )
              }
            >
              {solicitar.isPending ? "Enviando…" : "Enviar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}

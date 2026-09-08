import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpColaboradorCondicoes } from "@/hooks/useDpColaboradorCondicoes";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { useDpSetores } from "@/hooks/useDpSetores";
import { contratoPolicy, formasPagamentoDoRegime } from "@/lib/dp/contrato-policy";
import type { DpColaborador } from "@/hooks/useDpColaboradores";

const REGIMES = ["clt", "intermitente", "estagio", "temporario", "freelancer", "pj", "mei"] as const;

const FORMA_LABEL: Record<string, string> = {
  mensalista: "Mensalista (salário do mês)",
  horista: "Horista (valor da hora)",
  diarista: "Diarista (valor do dia)",
};

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const fmtMoeda = (v?: number | null) =>
  v == null ? null : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  colaborador: DpColaborador | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Alterar Condições de Trabalho: vínculo, cargo, unidade, setor e remuneração
 * passam a valer a partir de uma data, sem apagar o que valia antes.
 */
export function ColaboradorCondicoesDialog({ colaborador, open, onOpenChange }: Props) {
  const { historico, aplicar, isLoading } = useDpColaboradorCondicoes(colaborador?.id);
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { setores = [] } = useDpSetores();

  const [vigencia, setVigencia] = useState(hoje());
  const [regime, setRegime] = useState<string>("clt");
  const [forma, setForma] = useState<string>("mensalista");
  const [cargoId, setCargoId] = useState<string>("");
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [setorId, setSetorId] = useState<string>("");
  const [salario, setSalario] = useState<string>("");
  const [valorHora, setValorHora] = useState<string>("");
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open || !colaborador) return;
    setVigencia(hoje());
    setRegime(colaborador.regime ?? "clt");
    setForma(colaborador.forma_pagamento ?? "mensalista");
    setCargoId(colaborador.cargo_id ?? "");
    setUnidadeId(colaborador.unidade_id ?? "");
    setSetorId(colaborador.setor_id ?? "");
    setSalario(colaborador.salario_base != null ? String(colaborador.salario_base) : "");
    setValorHora(colaborador.valor_hora != null ? String(colaborador.valor_hora) : "");
    setJustificativa("");
  }, [open, colaborador]);

  const policy = useMemo(() => contratoPolicy(regime), [regime]);
  const formasPermitidas = useMemo(() => formasPagamentoDoRegime(regime), [regime]);

  useEffect(() => {
    if (!formasPermitidas.includes(forma as never)) setForma(formasPermitidas[0]);
  }, [formasPermitidas, forma]);

  const setoresDaUnidade = useMemo(
    () => setores.filter((s) => !unidadeId || !s.unidade_id || s.unidade_id === unidadeId),
    [setores, unidadeId],
  );

  const nome = (lista: { id: string; nome: string }[], id?: string | null) =>
    lista.find((i) => i.id === id)?.nome ?? null;

  const salvar = async () => {
    if (!vigencia) {
      toast.error("Informe a data em que a mudança passa a valer.");
      return;
    }
    if (justificativa.trim().length < 5) {
      toast.error("Explique brevemente o motivo da mudança.");
      return;
    }
    try {
      await aplicar.mutateAsync({
        vigencia_inicio: vigencia,
        regime,
        forma_pagamento: forma,
        cargo_id: cargoId || null,
        unidade_id: unidadeId || null,
        setor_id: setorId || null,
        salario_base: forma === "mensalista" ? (salario ? Number(salario) : null) : null,
        valor_hora: forma !== "mensalista" ? (valorHora ? Number(valorHora) : null) : null,
        justificativa: justificativa.trim(),
      });
      toast.success(`Novas condições valendo a partir de ${fmtDate(vigencia)}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a mudança.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-lg">
        <DialogHeader className="border-b p-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary" aria-hidden="true" />
            Alterar Condições de Trabalho
          </DialogTitle>
          <DialogDescription>
            O que você mudar aqui passa a valer na data informada. O que valia antes fica guardado no histórico de {colaborador?.nome ?? "o colaborador"}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cond-vigencia">A partir de</Label>
              <Input
                id="cond-vigencia"
                type="date"
                value={vigencia}
                onChange={(e) => setVigencia(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de vínculo</Label>
              <Select value={regime} onValueChange={setRegime}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGIMES.map((r) => (
                    <SelectItem key={r} value={r}>{contratoPolicy(r).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Select value={cargoId} onValueChange={setCargoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {cargos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select
                value={unidadeId}
                onValueChange={(v) => {
                  setUnidadeId(v);
                  setSetorId("");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Setor habitual</Label>
              <Select value={setorId} onValueChange={setSetorId}>
                <SelectTrigger><SelectValue placeholder="Sem setor definido" /></SelectTrigger>
                <SelectContent>
                  {setoresDaUnidade.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {formasPermitidas.map((f) => (
                    <SelectItem key={f} value={f}>{FORMA_LABEL[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {forma === "mensalista" ? (
              <div className="space-y-1.5">
                <Label htmlFor="cond-salario">
                  {policy.remuneracaoSocietaria ? "Pró-labore do mês" : "Remuneração do mês"}
                </Label>
                <Input
                  id="cond-salario"
                  type="number"
                  min="0"
                  step="0.01"
                  value={salario}
                  onChange={(e) => setSalario(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="cond-hora">
                  {forma === "diarista" ? "Valor do dia" : "Valor da hora"}
                </Label>
                <Input
                  id="cond-hora"
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorHora}
                  onChange={(e) => setValorHora(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cond-justificativa">Motivo da mudança</Label>
            <Textarea
              id="cond-justificativa"
              rows={2}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: promoção acordada, mudança de unidade, ajuste de piso do sindicato."
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Histórico</p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : historico.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma mudança registrada ainda. A primeira que você salvar aparece aqui.
              </p>
            ) : (
              <ul className="space-y-2">
                {historico.map((h) => (
                  <li key={h.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {fmtDate(h.vigencia_inicio)} → {h.vigencia_fim ? fmtDate(h.vigencia_fim) : "atual"}
                      </Badge>
                      {h.regime ? <span>{contratoPolicy(h.regime).label}</span> : null}
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {[
                        nome(cargos as { id: string; nome: string }[], h.cargo_id),
                        nome(unidades as { id: string; nome: string }[], h.unidade_id),
                        nome(setores as { id: string; nome: string }[], h.setor_id),
                        fmtMoeda(h.salario_base) ?? (h.valor_hora ? `${fmtMoeda(h.valor_hora)} / hora` : null),
                      ]
                        .filter(Boolean)
                        .join(" • ") || "Sem detalhes registrados"}
                    </p>
                    {h.justificativa ? (
                      <p className="mt-1 text-xs text-muted-foreground">Motivo: {h.justificativa}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 border-t p-4">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={salvar} disabled={aplicar.isPending}>
            {aplicar.isPending ? "Salvando…" : "Aplicar mudança"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { useDpSetores } from "@/hooks/useDpSetores";
import { contratoPolicy, formasPagamentoDoRegime } from "@/lib/dp/contrato-policy";
import { useRecontratarDpColaborador, type DpColaborador } from "@/hooks/useDpColaboradores";

const REGIMES = ["clt", "intermitente", "estagio", "temporario", "freelancer", "pj", "mei"] as const;

const FORMA_LABEL: Record<string, string> = {
  mensalista: "Mensalista (valor do mês)",
  horista: "Horista (valor da hora)",
  diarista: "Diarista (valor do dia)",
};

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");

interface Props {
  colaborador: DpColaborador | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Recontratação: cria um novo vínculo para quem já trabalhou na empresa, com
 * nova data de admissão. Diferente de reintegrar, que apenas desfaz um
 * desligamento registrado por engano — aqui o vínculo antigo fica no histórico.
 */
export function ColaboradorRecontratacaoDialog({ colaborador, open, onOpenChange }: Props) {
  const recontratar = useRecontratarDpColaborador();
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { setores = [] } = useDpSetores();

  const [admissao, setAdmissao] = useState(hoje());
  const [regime, setRegime] = useState<string>("clt");
  const [forma, setForma] = useState<string>("mensalista");
  const [cargoId, setCargoId] = useState<string>("");
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [setorId, setSetorId] = useState<string>("");
  const [salario, setSalario] = useState<string>("");
  const [valorHora, setValorHora] = useState<string>("");
  const [matricula, setMatricula] = useState<string>("");
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open || !colaborador) return;
    setAdmissao(hoje());
    setRegime(colaborador.regime ?? "clt");
    setForma(colaborador.forma_pagamento ?? "mensalista");
    setCargoId(colaborador.cargo_id ?? "");
    setUnidadeId(colaborador.unidade_id ?? "");
    setSetorId(colaborador.setor_id ?? "");
    setSalario(colaborador.salario_base != null ? String(colaborador.salario_base) : "");
    setValorHora(colaborador.valor_hora != null ? String(colaborador.valor_hora) : "");
    setMatricula("");
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

  const salvar = async () => {
    if (!colaborador) return;
    if (!admissao) {
      toast.error("Informe a nova data de admissão.");
      return;
    }
    if (colaborador.data_desligamento && admissao <= colaborador.data_desligamento) {
      toast.error("A nova admissão precisa ser depois da data do desligamento anterior.");
      return;
    }
    try {
      await recontratar.mutateAsync({
        id: colaborador.id,
        data_admissao: admissao,
        regime,
        forma_pagamento: forma,
        cargo_id: cargoId || null,
        unidade_id: unidadeId || null,
        setor_id: setorId || null,
        salario_base: forma === "mensalista" ? (salario ? Number(salario) : null) : null,
        valor_hora: forma !== "mensalista" ? (valorHora ? Number(valorHora) : null) : null,
        matricula: matricula.trim() || null,
        justificativa: justificativa.trim() || null,
      });
      toast.success(`${colaborador.nome} recontratado(a) a partir de ${fmtDate(admissao)}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a recontratação.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-lg">
        <DialogHeader className="border-b p-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />
            Recontratar Colaborador
          </DialogTitle>
          <DialogDescription>
            Novo vínculo para {colaborador?.nome ?? "a pessoa"}, começando na data que você informar. O
            vínculo anterior — inclusive o desligamento de {fmtDate(colaborador?.data_desligamento)} — fica
            guardado no histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rec-admissao">Nova data de admissão *</Label>
              <Input
                id="rec-admissao"
                type="date"
                value={admissao}
                onChange={(e) => setAdmissao(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-matricula">Nova matrícula</Label>
              <Input
                id="rec-matricula"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="Deixe em branco para manter a atual"
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
                <Label htmlFor="rec-salario">
                  {policy.remuneracaoSocietaria
                    ? "Pró-labore do mês"
                    : policy.entraEmFolha
                      ? "Remuneração do mês"
                      : "Remuneração acordada do mês"}
                </Label>
                <Input
                  id="rec-salario"
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
                <Label htmlFor="rec-hora">{forma === "diarista" ? "Valor do dia" : "Valor da hora"}</Label>
                <Input
                  id="rec-hora"
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
            <Label htmlFor="rec-justificativa">Observação da recontratação</Label>
            <Textarea
              id="rec-justificativa"
              rows={2}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: retorno para a mesma função na unidade centro."
            />
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 border-t p-4">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={salvar} disabled={recontratar.isPending}>
            {recontratar.isPending ? "Salvando…" : "Confirmar recontratação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

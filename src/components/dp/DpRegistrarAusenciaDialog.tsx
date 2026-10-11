import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";
import { sugestaoDataFim, duracaoPadrao, TIPOS_LICENCA_CURTA, TIPO_AFASTAMENTO_LABEL } from "@/lib/dp/licencas";
import { FundamentoLegalCard } from "@/components/dp/licencas/FundamentoLegalCard";
import { DpFilePicker } from "@/components/dp/DpFilePicker";
import { AtribuirFolgaTriagemDialog } from "@/components/dp/AtribuirFolgaTriagemDialog";
import { SuspensaoNovoModal } from "@/components/dp/disciplinar/SuspensaoNovoModal";
import { FeriasNovoModal } from "@/components/dp/ferias/FeriasNovoModal";
import { OcorrenciaFormDialog } from "@/components/dp/ocorrencias/OcorrenciaFormDialog";
import { textoErroOcorrencia } from "@/lib/dp/ocorrencias";
import { prepararUpload } from "@/lib/storage/uploadPolicy";
import { sanitizeStorageFilename } from "@/lib/storage";

type Tipo = Database["public"]["Enums"]["dp_solicitacao_tipo"];

/** Motivos do roteador: cada um abre o fluxo oficial da sua área. */
export type Motivo = "folga" | "ferias" | "afastamento" | "falta" | "suspensao";

const MOTIVO_LABEL: Record<Motivo, string> = {
  folga: "Folga (compensatória, extra ou troca)",
  ferias: "Férias",
  afastamento: "Atestado médico ou licença",
  falta: "Falta",
  suspensao: "Suspensão disciplinar",
};

/** Somente afastamentos reais (sem folga, adiantamento ou envio de documentos). */
const TIPO_AFAST_LABEL: Partial<Record<Tipo, string>> = {
  atestado: "Atestado médico",
  licenca_maternidade: "Licença-maternidade",
  licenca_paternidade: "Licença-paternidade",
  ...(Object.fromEntries(TIPOS_LICENCA_CURTA.map((t) => [t, TIPO_AFASTAMENTO_LABEL[t]])) as Partial<Record<Tipo, string>>),
  outros: "Outro afastamento",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Data inicial sugerida (AAAA-MM-DD), ex.: vinda do calendário. */
  dataInicial?: string | null;
  /** Motivo já escolhido (ex.: botão "Atribuir Folga"). */
  motivoInicial?: Motivo;
}

/**
 * Porta única de "Registrar Ausência" no calendário: o gestor escolhe
 * colaborador, data e motivo, e o sistema abre o formulário oficial já
 * preenchido. Só atestados/licenças e faltas são gravados aqui mesmo.
 */
export function DpRegistrarAusenciaDialog({ open, onOpenChange, dataInicial, motivoInicial }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const ativos = (colabs.data ?? []).filter((c) => c.ativo !== false);

  const [etapa, setEtapa] = useState<"escolha" | "afastamento">("escolha");
  const [motivo, setMotivo] = useState<Motivo>("afastamento");
  const [folgaOpen, setFolgaOpen] = useState(false);
  const [faltaOpen, setFaltaOpen] = useState(false);
  const [feriasOpen, setFeriasOpen] = useState(false);
  const [suspOpen, setSuspOpen] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [form, setForm] = useState({
    colaborador_id: "",
    tipo: "atestado" as Tipo,
    data_alvo: "",
    data_fim: "",
    motivo: "",
  });

  useEffect(() => {
    if (!open) return;
    setEtapa("escolha");
    setMotivo(motivoInicial ?? "afastamento");
    setArquivo(null);
    const hoje = new Date().toISOString().slice(0, 10);
    setForm({
      colaborador_id: "",
      tipo: "atestado",
      data_alvo: dataInicial ?? hoje,
      data_fim: dataInicial ?? hoje,
      motivo: "",
    });
  }, [open, dataInicial, motivoInicial]);

  useEffect(() => {
    if (form.data_fim && form.data_alvo && form.data_fim < form.data_alvo)
      setForm((f) => ({ ...f, data_fim: f.data_alvo }));
  }, [form.data_alvo, form.data_fim]);

  const nomeColab = ativos.find((c) => c.id === form.colaborador_id)?.nome ?? "";

  const continuar = () => {
    if (!form.colaborador_id) return toast.error("Selecione o colaborador");
    if (!form.data_alvo) return toast.error("Informe a data");
    switch (motivo) {
      case "folga":
        onOpenChange(false);
        setFolgaOpen(true);
        break;
      case "falta":
        onOpenChange(false);
        setFaltaOpen(true);
        break;
      case "ferias":
        onOpenChange(false);
        setFeriasOpen(true);
        break;
      case "suspensao":
        onOpenChange(false);
        setSuspOpen(true);
        break;
      case "afastamento":
        setEtapa("afastamento");
        break;
    }
  };

  const sugerirDuracao = (tipo: Tipo, dataInicio: string) => {
    const fim = sugestaoDataFim(tipo, dataInicio);
    if (fim) setForm((f) => ({ ...f, data_fim: fim }));
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (form.motivo.length > 500) throw new Error("Observações muito longas (máx. 500)");
      const licenca = form.tipo !== "atestado";
      if (!arquivo && !licenca) throw new Error("Anexe o arquivo do atestado");
      let path: string | null = null;
      if (arquivo) {
        const envio = await prepararUpload("dp-documentos", arquivo);
        path = `${selectedCompanyId}/${licenca ? "licenca" : "atestado"}/${form.colaborador_id}/${Date.now()}-${sanitizeStorageFilename(envio.name)}`;
        const up = await supabase.storage.from("dp-documentos").upload(path, envio, { upsert: false });
        if (up.error) throw up.error;
      }
      const { error } = await supabase.rpc("dp_solicitacao_criar_admin", {
        p_colaborador: form.colaborador_id,
        p_tipo: form.tipo,
        p_data_alvo: form.data_alvo,
        p_data_fim: (form.data_fim || null) as any,
        p_motivo: (form.motivo.trim() || null) as any,
        p_arquivo_path: path as any,
        p_aprovada: true,
      });
      if (error) {
        if (path) await supabase.storage.from("dp-documentos").remove([path]).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Ausência registrada", { description: "Já aparece no calendário e em Atestados." });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Não foi possível registrar", { description: e instanceof Error ? e.message : String(e) }),
  });

  const falta = useMutation({
    mutationFn: async (input: Parameters<React.ComponentProps<typeof OcorrenciaFormDialog>["onSubmit"]>[0]) => {
      const { error } = await supabase.rpc("dp_ocorrencia_registrar", {
        _colaborador_id: input.colaboradorId,
        _data: input.data,
        _tipo: input.tipo,
        _justificativa: input.justificativa ?? null,
        _horario_estimado: input.horarioEstimado ?? null,
        _horario_real: input.horarioReal ?? null,
        _marcacao_alvo: input.marcacaoAlvo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Falta registrada", { description: "Também aparece nas ocorrências do colaborador." });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("dp_ocorrencia") });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      setFaltaOpen(false);
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Ausência</DialogTitle>
            <DialogDescription>
              {etapa === "escolha"
                ? "Escolha o colaborador e o motivo. Abrimos o formulário certo já preenchido."
                : `${nomeColab} — atestado ou licença com o comprovante.`}
            </DialogDescription>
          </DialogHeader>

          {etapa === "escolha" ? (
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>Colaborador *</Label>
                <Select value={form.colaborador_id} onValueChange={(v) => setForm({ ...form, colaborador_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {ativos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                    {ativos.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Nenhum colaborador ativo. Cadastre em Colaboradores.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Data *</Label>
                <Input type="date" value={form.data_alvo}
                  onChange={(e) => setForm({ ...form, data_alvo: e.target.value, data_fim: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Motivo *</Label>
                <Select value={motivo} onValueChange={(v) => setMotivo(v as Motivo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MOTIVO_LABEL) as Motivo[]).map((m) => (
                      <SelectItem key={m} value={m}>{MOTIVO_LABEL[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => {
                  const tipo = v as Tipo;
                  setForm({ ...form, tipo });
                  if (duracaoPadrao(tipo) && form.data_alvo) sugerirDuracao(tipo, form.data_alvo);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_AFAST_LABEL) as Tipo[]).map((t) => (
                      <SelectItem key={t} value={t}>{TIPO_AFAST_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Data inicial *</Label>
                  <Input type="date" value={form.data_alvo} onChange={(e) => {
                    const inicio = e.target.value;
                    setForm({ ...form, data_alvo: inicio });
                    if (duracaoPadrao(form.tipo) && inicio) sugerirDuracao(form.tipo, inicio);
                  }} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Data final</Label>
                  <Input type="date" min={form.data_alvo || undefined} value={form.data_fim}
                    onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
                  {duracaoPadrao(form.tipo) && (
                    <p className="text-[10px] text-muted-foreground">
                      Padrão legal: {duracaoPadrao(form.tipo)} dia(s) — ajuste se necessário.
                    </p>
                  )}
                </div>
              </div>
              <FundamentoLegalCard tipo={form.tipo} inicio={form.data_alvo} fim={form.data_fim} />
              <div className="grid gap-1.5">
                <Label>Comprovante {form.tipo === "atestado" ? "*" : "(pode anexar depois)"}</Label>
                <DpFilePicker accept="application/pdf,image/*" file={arquivo} onFileChange={setArquivo} />
                <p className="text-[10px] text-muted-foreground">PDF ou foto, até 15 MB.</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Observação</Label>
                <Textarea rows={3} maxLength={500} placeholder="Contexto ou observação (opcional)"
                  value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {etapa === "afastamento" ? (
              <>
                <Button variant="ghost" onClick={() => setEtapa("escolha")} disabled={salvar.isPending}>Voltar</Button>
                <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                  {salvar.isPending ? "Salvando..." : "Registrar"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button onClick={continuar}>Continuar</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedCompanyId && form.colaborador_id && (
        <AtribuirFolgaTriagemDialog
          open={folgaOpen}
          onOpenChange={setFolgaOpen}
          companyId={selectedCompanyId}
          colaboradorId={form.colaborador_id}
          colaboradorNome={nomeColab}
          dataIso={form.data_alvo}
          onDone={() => setFolgaOpen(false)}
        />
      )}

      <FeriasNovoModal
        open={feriasOpen}
        onOpenChange={setFeriasOpen}
        colaboradorId={form.colaborador_id}
        dataInicio={form.data_alvo}
      />
      <SuspensaoNovoModal
        open={suspOpen}
        onOpenChange={setSuspOpen}
        colaboradorId={form.colaborador_id}
        colaboradorNome={nomeColab}
        regime={ativos.find((c) => c.id === form.colaborador_id)?.regime ?? null}
        data={form.data_alvo}
      />
      <OcorrenciaFormDialog
        open={faltaOpen}
        onOpenChange={setFaltaOpen}
        colaboradores={ativos.map((c) => ({ id: c.id, nome: c.nome }))}
        dataInicial={form.data_alvo}
        colaboradorInicial={form.colaborador_id}
        saving={falta.isPending}
        onSubmit={(input) => falta.mutate(input)}
      />
    </>
  );
}

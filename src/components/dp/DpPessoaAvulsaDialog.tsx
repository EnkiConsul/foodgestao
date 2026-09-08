import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColaboradorSetorField } from "@/components/dp/setores/ColaboradorSetorField";
import { pessoaAvulsaSchema, validateWithToast } from "@/lib/validations";
import type { PessoaAvulsaInput } from "@/hooks/useDpOperacaoPanorama";
import { useDpPessoasApoio, useSalvarDpPessoaApoio } from "@/hooks/useDpPessoasApoio";
import type { HorarioSugerido, PessoaAvulsaPanorama, PessoaAvulsaTipo } from "@/lib/dp/operacao-panorama";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dia clicado no painel: vira data inicial e final por padrão. */
  dataInicial: string;
  unidadePadrao?: string | null;
  unidades: { id: string; nome: string }[];
  cargos: { id: string; nome: string }[];
  colaboradores: { id: string; nome: string; cargo_id?: string | null; unidade_id?: string | null }[];
  /** Registro em edição; ausente = novo cadastro. */
  registro?: PessoaAvulsaPanorama | null;
  salvando?: boolean;
  /** Sugere horário de entrada/saída com base no histórico do cargo/unidade/dia da semana. */
  sugerirHorario?: (unidadeId: string, cargoId: string, data: string) => HorarioSugerido | null;
  onSalvar: (input: PessoaAvulsaInput) => void;
}

const TIPO_LABEL: Record<PessoaAvulsaTipo, string> = {
  folguista: "Folguista",
  teste: "Teste",
  registro_manual: "Colaborador",
};

/** Explicação de cada tipo, mostrada no ícone de informação ao lado do campo. */
const TIPO_INFO: Record<PessoaAvulsaTipo, string> = {
  folguista: "Folguista: pessoa que cobre uma folga, falta ou atestado, ou reforça a equipe pontualmente.",
  teste: "Teste: pessoa em avaliação operacional na loja, ainda sem cadastro de colaborador.",
  registro_manual:
    "Colaborador: pessoa já cadastrada na empresa, adicionada de forma extraordinária a este dia (quando a convocação ou a escala não foi feita).",
};

/**
 * Aviso contextual de risco: classificação operacional, nunca conclusão legal.
 * Textos alinhados à orientação jurídica do cadastro de vínculos.
 */
const TIPO_RISCO: Partial<Record<PessoaAvulsaTipo, string>> = {
  folguista:
    "“Folguista” é uma classificação operacional de cobertura ou reforço — não é um regime de contratação. O enquadramento trabalhista da pessoa deve ser definido e formalizado pela empresa.",
  teste:
    "“Teste” é apenas uma identificação operacional de avaliação — não representa um regime de contratação nem substitui a formalização aplicável.",
};

const RISCO_GERAL =
  "Esta classificação é operacional e não substitui a formalização trabalhista aplicável. Dependendo das características reais da relação de trabalho, podem existir obrigações trabalhistas, previdenciárias ou contratuais. Em caso de dúvida, consulte seu contador, departamento pessoal ou assessoria jurídica.";

/** Motivos operacionais de cobertura (atestado não cria documento médico). */
const COBRE_MOTIVO_LABEL: Record<string, string> = {
  folga: "Folga",
  falta: "Falta",
  atestado: "Atestado",
  outro: "Outro",
};

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};


/**
 * Cadastro rápido de quem trabalhou no dia: colaborador cadastrado registrado
 * manualmente (convocação/escala esquecida) ou pessoa não cadastrada em teste /
 * folguista. Só entra na rotina do dia — não gera folga, ponto, folha nem
 * convocação.
 */
export function DpPessoaAvulsaDialog({
  open,
  onOpenChange,
  dataInicial,
  unidadePadrao,
  unidades,
  cargos,
  colaboradores,
  registro,
  salvando,
  sugerirHorario,
  onSalvar,
}: Props) {
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    pessoa_apoio_id: "",
    tipo: "folguista" as PessoaAvulsaTipo,
    colaborador_id: "",
    unidade_id: "",
    cargo_id: "",
    setor_id: "",
    cobre_colaborador_id: "",
    cobre_motivo: "",
    data_inicio: dataInicial,
    data_fim: dataInicial,
    entrada: "",
    saida: "",
    termina_no_dia_seguinte: false,
    observacao: "",
  });
  const [horarioTocado, setHorarioTocado] = useState(false);
  const apoio = useDpPessoasApoio({ apenasAtivos: true });
  const salvarApoio = useSalvarDpPessoaApoio();


  const manual = form.tipo === "registro_manual";
  const hoje = hojeIso();

  useEffect(() => {
    if (!open) return;
    setHorarioTocado(false);
    const dataBase = registro?.data_inicio ?? (dataInicial > hojeIso() ? hojeIso() : dataInicial);
    setForm({
      nome: registro?.nome ?? "",
      telefone: registro?.telefone ?? "",
      pessoa_apoio_id: registro?.pessoa_apoio_id ?? "",
      tipo: registro?.tipo ?? "folguista",

      colaborador_id: registro?.colaborador_id ?? "",
      unidade_id: registro?.unidade_id ?? unidadePadrao ?? (unidades.length === 1 ? unidades[0].id : ""),
      cargo_id: registro?.cargo_id ?? "",
      setor_id: registro?.setor_id ?? registro?.setor_habitual_id ?? "",
      cobre_colaborador_id: registro?.cobre_colaborador_id ?? "",
      cobre_motivo: registro?.cobre_motivo ?? "",
      data_inicio: dataBase,
      data_fim: registro?.data_fim ?? dataBase,
      entrada: registro?.entrada ?? "",
      saida: registro?.saida ?? "",
      termina_no_dia_seguinte: registro?.termina_no_dia_seguinte ?? false,
      observacao: registro?.observacao ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, registro, dataInicial, unidadePadrao]);

  useEffect(() => {
    if (!open || !sugerirHorario || horarioTocado || !form.unidade_id || !form.cargo_id || !form.data_inicio) return;
    const sugerido = sugerirHorario(form.unidade_id, form.cargo_id, form.data_inicio);
    if (!sugerido) return;
    setForm((f) => ({
      ...f,
      entrada: sugerido.entrada,
      saida: sugerido.saida,
      termina_no_dia_seguinte: sugerido.termina_no_dia_seguinte,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sugerirHorario, form.unidade_id, form.cargo_id, form.data_inicio]);

  /** Ao escolher o colaborador, já traz o cargo e a unidade do cadastro dele. */
  const escolherColaborador = (id: string) => {
    const c = colaboradores.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      colaborador_id: id,
      cargo_id: c?.cargo_id ?? f.cargo_id,
      unidade_id: c?.unidade_id ?? f.unidade_id,
    }));
  };

  /**
   * Troca o tipo limpando identificadores incompatíveis: dados de pessoa de
   * apoio não valem para colaborador cadastrado, e cobertura só existe no
   * folguista.
   */
  const trocarTipo = (v: PessoaAvulsaTipo) => {
    setForm((f) => ({
      ...f,
      tipo: v,
      colaborador_id: v === "registro_manual" ? f.colaborador_id : "",
      pessoa_apoio_id: v === "registro_manual" ? "" : f.pessoa_apoio_id,
      nome: v === "registro_manual" ? "" : f.nome,
      telefone: v === "registro_manual" ? "" : f.telefone,
      cobre_colaborador_id: v === "folguista" ? f.cobre_colaborador_id : "",
      cobre_motivo: v === "folguista" ? f.cobre_motivo : "",
    }));
  };

  /** Reaproveita alguém já cadastrado no banco de folguistas/testes. */
  const escolherApoio = (id: string) => {
    if (id === "novo") {
      // "Nova pessoa" limpa tudo que foi herdado de outro cadastro; preserva
      // apenas as datas e a unidade da operação (padrão da tela).
      setForm((f) => ({
        ...f,
        pessoa_apoio_id: "",
        nome: "",
        telefone: "",
        cargo_id: "",
        setor_id: "",
        cobre_colaborador_id: "",
        cobre_motivo: "",
        unidade_id: unidadePadrao ?? (unidades.length === 1 ? unidades[0].id : ""),
      }));
      return;
    }
    const p = (apoio.data ?? []).find((x) => x.id === id);
    if (!p) return;
    setForm((f) => ({
      ...f,
      pessoa_apoio_id: p.id,
      nome: p.nome,
      telefone: p.telefone ?? "",
      tipo: p.tipo,
      cargo_id: p.cargo_id ?? f.cargo_id,
      unidade_id: p.unidade_id ?? f.unidade_id,
      setor_id: p.setor_id ?? f.setor_id,
    }));
  };

  const salvar = async () => {
    if (manual && form.data_fim > hoje) {
      toast.error("Data futura não permitida", {
        description: "Para dias futuros use a convocação ou a escala.",
      });
      return;
    }
    const candidato: PessoaAvulsaInput = {
      nome: manual ? null : form.nome.trim(),
      tipo: form.tipo,
      colaborador_id: manual ? form.colaborador_id || null : null,
      unidade_id: form.unidade_id,
      cargo_id: form.cargo_id,
      cobre_colaborador_id: form.cobre_colaborador_id || null,
      cobre_motivo: form.cobre_colaborador_id ? form.cobre_motivo || null : null,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      entrada: form.entrada || null,
      saida: form.saida || null,
      termina_no_dia_seguinte: form.termina_no_dia_seguinte,
      observacao: form.observacao || null,
      telefone: manual ? null : form.telefone || null,
      setor_id: form.setor_id || null,
      pessoa_apoio_id: manual ? null : form.pessoa_apoio_id || null,
    };
    const parsed = validateWithToast(pessoaAvulsaSchema, candidato, (msg) =>
      toast.error("Verifique os dados", { description: msg }),
    );
    if (!parsed) return;

    // Quem não é colaborador cadastrado fica salvo no banco de apoio para reuso.
    let apoioId = candidato.pessoa_apoio_id ?? null;
    if (!manual) {
      try {
        apoioId = await salvarApoio.mutateAsync({
          id: apoioId ?? undefined,
          nome: candidato.nome!,
          telefone: candidato.telefone ?? null,
          tipo: form.tipo === "teste" ? "teste" : "folguista",
          cargo_id: form.cargo_id || null,
          unidade_id: form.unidade_id || null,
          setor_id: form.setor_id || null,
          cpf: null,
          genero: null,
          data_nascimento: null,
          observacao: null,
          colaborador_id: null,
        });
      } catch {
        apoioId = candidato.pessoa_apoio_id ?? null;
      }
    }
    onSalvar({ ...candidato, pessoa_apoio_id: apoioId, id: registro?.id });
  };



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{registro ? "Editar Pessoa no Dia" : "Adicionar Pessoa no Dia"}</DialogTitle>
          <DialogDescription>
            Adicione uma pessoa à equipe deste dia. Ela aparece na rotina e conta no quadro.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto py-2 pr-1">
          <div className="grid gap-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Tipo de Mão de Obra Extra *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="O que é cada tipo"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 space-y-2 text-xs" align="start">
                  {(Object.keys(TIPO_INFO) as PessoaAvulsaTipo[]).map((t) => (
                    <p key={t}>{TIPO_INFO[t]}</p>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <Select value={form.tipo} onValueChange={(v) => trocarTipo(v as PessoaAvulsaTipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_LABEL) as PessoaAvulsaTipo[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {TIPO_RISCO[form.tipo] && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-muted-foreground">
                <p>{TIPO_RISCO[form.tipo]}</p>
                <p className="mt-1.5">{RISCO_GERAL}</p>
              </div>
            )}
          </div>

          {manual ? (
            <div className="grid gap-1.5">
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={escolherColaborador}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Só para hoje ou dias que já passaram. Não gera convocação, ponto nem folha.
              </p>
            </div>
          ) : (
            <>
              {(apoio.data ?? []).length > 0 && (
                <div className="grid gap-1.5">
                  <Label>Já cadastrada antes?</Label>
                  <Select value={form.pessoa_apoio_id || "novo"} onValueChange={escolherApoio}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nova pessoa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="novo">Nova pessoa</SelectItem>
                      {(apoio.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                          {p.telefone ? ` — ${p.telefone}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Escolha alguém do banco de folguistas e testes para preencher tudo.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Nome da pessoa *</Label>
                  <Input
                    value={form.nome}
                    maxLength={120}
                    placeholder="Ex.: Maria Souza"
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Telefone</Label>
                  <Input
                    value={form.telefone}
                    maxLength={20}
                    inputMode="tel"
                    placeholder="(62) 90000-0000"
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}



          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Unidade *</Label>
              <Select
                value={form.unidade_id}
                onValueChange={(v) => setForm({ ...form, unidade_id: v, setor_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Cargo do dia *</Label>
              <Select value={form.cargo_id} onValueChange={(v) => setForm({ ...form, cargo_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {cargos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <ColaboradorSetorField
              unidadeId={form.unidade_id || null}
              value={form.setor_id || null}
              onChange={(id) => setForm({ ...form, setor_id: id ?? "" })}
            />
            <p className="text-xs text-muted-foreground">
              Vale só para este registro. Ao deixar em branco, usamos o setor habitual do cadastro.
            </p>
          </div>

          {form.tipo === "folguista" && (
            <>
              <div className="grid gap-1.5">
                <Label>Cobrindo quem (opcional)</Label>
                <Select
                  value={form.cobre_colaborador_id || "nenhum"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      cobre_colaborador_id: v === "nenhum" ? "" : v,
                      cobre_motivo: v === "nenhum" ? "" : form.cobre_motivo,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ninguém em específico" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Ninguém em específico</SelectItem>
                    {colaboradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!form.cobre_colaborador_id && (
                  <p className="text-xs text-muted-foreground">
                    Sem cobertura, a pessoa aparece como “Folguista Extra” na rotina.
                  </p>
                )}
              </div>
              {form.cobre_colaborador_id && (
                <div className="grid gap-1.5">
                  <Label>Motivo da cobertura</Label>
                  <Select
                    value={form.cobre_motivo || "outro"}
                    onValueChange={(v) => setForm({ ...form, cobre_motivo: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COBRE_MOTIVO_LABEL).map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {form.cobre_motivo === "atestado"
                      ? "Motivo apenas operacional: não cria nem substitui o documento médico."
                      : form.cobre_motivo === "falta" || form.cobre_motivo === "atestado"
                        ? "O dia da pessoa coberta é ajustado automaticamente: se já houver registro, ele é reaproveitado sem duplicar."
                        : "Se a pessoa coberta já tiver folga ou ausência registrada no dia, o registro existente é reaproveitado."}
                  </p>
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Data inicial *</Label>
              <Input
                type="date"
                max={manual ? hoje : undefined}
                value={form.data_inicio}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    data_inicio: e.target.value,
                    data_fim: f.data_fim && f.data_fim >= e.target.value ? f.data_fim : e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Data final *</Label>
              <Input
                type="date"
                min={form.data_inicio || undefined}
                max={manual ? hoje : undefined}
                value={form.data_fim}
                onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              />

            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Entrada</Label>
              <Input
                type="time"
                value={form.entrada}
                onChange={(e) => {
                  setHorarioTocado(true);
                  setForm({ ...form, entrada: e.target.value });
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Saída</Label>
              <Input
                type="time"
                value={form.saida}
                onChange={(e) => {
                  setHorarioTocado(true);
                  setForm({ ...form, saida: e.target.value });
                }}
              />
            </div>
          </div>
          {sugerirHorario && form.unidade_id && form.cargo_id && form.data_inicio && (
            <p className="text-xs text-muted-foreground">
              Sugerido pelo horário mais usado neste cargo/unidade.
            </p>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-3">
              <Label className="text-sm">Termina no dia seguinte</Label>
              <p className="text-xs text-muted-foreground">Marque quando a saída passa da meia-noite.</p>
            </div>
            <Switch
              checked={form.termina_no_dia_seguinte}
              onCheckedChange={(v) => setForm({ ...form, termina_no_dia_seguinte: v })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Observação</Label>
            <Textarea
              rows={2}
              maxLength={500}
              placeholder="Contexto do dia (opcional)"
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : registro ? "Salvar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

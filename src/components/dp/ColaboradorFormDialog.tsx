import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUpsertDpColaborador, type DpColaborador } from "@/hooks/useDpColaboradores";
import { useDpUnidades, useDpCargos, useUpsertDpCargo, type DpCargo } from "@/hooks/useDpCadastros";
import { useDpBeneficios } from "@/hooks/useDpBeneficios";
import { Textarea } from "@/components/ui/textarea";
import { maskCpf, isValidCpf } from "@/lib/cpf";
import { MOTIVO_DESLIGAMENTO_OPTIONS, ELEGIBILIDADE_OPTIONS } from "@/lib/dp/desligamento";
import type { Database } from "@/integrations/supabase/types";
import { contratoPolicy } from "@/lib/dp/contrato-policy";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { CienciaLegalDialog } from "@/components/dp/CienciaLegalDialog";
import { ColaboradorJornadaPanel } from "@/components/dp/ColaboradorJornadaPanel";
import { CargoQuickCreateDialog } from "@/components/dp/CargoQuickCreateDialog";
import { CargoSalarioConflitoDialog } from "@/components/dp/CargoSalarioConflitoDialog";
import { compararSalarioCargo, moedaBR, salarioReferencia, sugerirNomeVariacao } from "@/lib/dp/cargos";
import {
  RemuneracaoFields,
  remuneracaoBlank,
  numeroBR,
  type RemuneracaoFormState,
} from "@/components/dp/RemuneracaoFields";
import {
  formaPagamentoPadrao,
  ajustarFormaPagamento,
  remuneracaoPendente,
  permiteAdiantamento as permiteAdiantamentoRemuneracao,
  BASE_HORAS_MES_PADRAO,
  BASE_DIAS_MES_PADRAO,
  type FormaPagamento,
  type AssiduidadeCriterio,
} from "@/lib/dp/remuneracao";





type Regime = Database["public"]["Enums"]["dp_regime_trabalho"];

// Rótulos do vínculo exibidos no cadastro. O comportamento legal vem sempre do
// regime (VINCULO_TO_REGIME); o rótulo escolhido é guardado em `vinculo_label`
// para que Sócio/PJ voltem corretamente na edição.
const TIPOS_VINCULO: { value: string; label: string }[] = [
  { value: "CLT", label: "CLT efetivo" },
  { value: "Intermitente", label: "CLT intermitente" },
  { value: "Estagiario", label: "Estagiário" },
  { value: "Temporario", label: "Temporário" },
  { value: "PJ", label: "PJ" },
  { value: "Socio", label: "Sócio" },
  { value: "Freelancer", label: "Freelancer (sem registro)" },
];

// (Dropdown "Regime de Trabalho" removido: duplicava o Tipo de Vínculo e não era persistido.
//  O regime do banco é derivado de tipo_vinculo via VINCULO_TO_REGIME abaixo.)

// Map UI "Tipo de Vínculo" (rótulos da documentação) para enum do banco (dp_regime_trabalho)
const VINCULO_TO_REGIME: Record<string, Regime> = {
  CLT: "clt",
  Intermitente: "intermitente",
  Socio: "pj",
  Estagiario: "estagio",
  PJ: "pj",
  Temporario: "temporario",
  Freelancer: "freelancer",
};

// Mapa reverso: o banco guarda apenas `regime`, então na edição resolvemos o
// rótulo canônico do vínculo a partir dele (Sócio/PJ/Autônomo compartilham `pj`).
const REGIME_TO_VINCULO: Record<string, string> = {
  clt: "CLT",
  intermitente: "Intermitente",
  estagio: "Estagiario",
  temporario: "Temporario",
  pj: "PJ",
  mei: "PJ",
  freelancer: "Freelancer",
};

const DIAS_SEMANA = [
  { value: "none", label: "Nenhuma" },
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  colaborador?: DpColaborador | null;
}

const NONE_DESLIG = "__none__";

const blank = {
  nome: "",
  cpf: "",
  matricula: "",
  email: "",
  whatsapp: "",
  cargo_id: "",
  unidade_id: "",
  data_admissao: "",
  data_nascimento: "",
  data_desligamento: "",
  motivo_desligamento: NONE_DESLIG,
  elegivel_recontratacao: NONE_DESLIG,
  observacao_desligamento: "",
  tipo_vinculo: "CLT",
  folga_fixa_semana: "none",
  perfil_acesso: "colaborador" as "colaborador" | "gestor" | "admin",
  ativo: true,
  possui_folha_ponto: false,
  optante_adiantamento: false,
};

export function ColaboradorFormDialog({ open, onOpenChange, colaborador }: Props) {
  const upsert = useUpsertDpColaborador();
  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const upsertCargo = useUpsertDpCargo();
  const { beneficios, atribuicoes, saveAtribuicao } = useDpBeneficios();
  const [form, setForm] = useState(blank);
  const { selectedCompanyId } = useCompanyContext();
  const [cienciaAberta, setCienciaAberta] = useState(false);
  const [tab, setTab] = useState<"dados" | "jornada" | "remuneracao">("dados");
  /** Id do colaborador recém-criado — permite salvar a jornada sem sair do cadastro. */
  const [criadoId, setCriadoId] = useState<string | null>(null);
  /** Criação de cargo sem sair do cadastro. */
  const [novoCargoOpen, setNovoCargoOpen] = useState(false);
  /** Conflito entre o salário informado e o salário de referência do cargo. */
  const [conflitoCargo, setConflitoCargo] = useState<
    { salarioCargo: number; salarioInformado: number } | null
  >(null);
  /** Regras de cargo/salário já resolvidas para este salvamento. */
  const cargoResolvido = useRef(false);
  // Ciência do risco jurídico do vínculo sem registro, válida para este salvamento.
  const cienciaConfirmada = useRef<{ justificativa: string } | null>(null);


  const isEdit = !!colaborador?.id;
  const isDesligado = isEdit && !!colaborador?.data_desligamento;
  // Comportamento da jornada/folga é derivado do contrato, nunca testado inline.
  const policy = contratoPolicy(VINCULO_TO_REGIME[form.tipo_vinculo]);


  const [rem, setRem] = useState<RemuneracaoFormState>(remuneracaoBlank);
  const patchRem = (patch: Partial<RemuneracaoFormState>) => setRem((r) => ({ ...r, ...patch }));

  useEffect(() => {
    if (!open) return;
    cienciaConfirmada.current = null;
    setTab("dados");
    setCriadoId(null);
    const c = (colaborador ?? {}) as any;
    const regime = c.regime ? String(c.regime) : "clt";
    setRem({
      ...remuneracaoBlank,
      // Dados legados incompatíveis (ex.: intermitente mensalista) são ajustados
      // para a primeira forma admitida pelo contrato.
      forma_pagamento: ajustarFormaPagamento(
        regime,
        c.forma_pagamento ?? formaPagamentoPadrao(regime),
      ) as FormaPagamento,
      salario_base: c.salario_base != null ? String(c.salario_base).replace(".", ",") : "",
      valor_hora: c.valor_hora != null ? String(c.valor_hora).replace(".", ",") : "",
      dependentes_irrf: String(c.dependentes_irrf ?? 0),
      adicional_percentual: String(c.adicional_percentual ?? 0).replace(".", ","),
      vale_transporte: !!c.vale_transporte,
      vale_transporte_valor_dia:
        c.vale_transporte_valor_dia != null ? String(c.vale_transporte_valor_dia).replace(".", ",") : "",
      beneficios: Object.fromEntries(
        (atribuicoes ?? [])
          .filter((a: any) => a.colaborador_id === c.id && a.ativo)
          .map((a: any) => [a.beneficio_id, true]),
      ),
      base_salarial: c.base_salarial != null ? String(c.base_salarial).replace(".", ",") : "",
      base_horas_mes: String(c.base_horas_mes ?? BASE_HORAS_MES_PADRAO),
      base_dias_mes: String(c.base_dias_mes ?? BASE_DIAS_MES_PADRAO),
      valor_hora_manual: !!c.valor_hora_manual,
      premio_assiduidade: !!c.premio_assiduidade,
      premio_assiduidade_valor:
        c.premio_assiduidade_valor != null ? String(c.premio_assiduidade_valor).replace(".", ",") : "",
      assiduidade_criterio: (c.assiduidade_criterio ?? "sem_faltas_sem_atrasos") as AssiduidadeCriterio,
      assiduidade_tolerancia_min: String(c.assiduidade_tolerancia_min ?? 10),
      assiduidade_max_atrasos: String(c.assiduidade_max_atrasos ?? 2),
    });

    setForm({

      nome: c.nome ?? "",
      cpf: c.cpf ? maskCpf(c.cpf) : "",
      matricula: c.matricula ?? "",
      email: c.email ?? "",
      whatsapp: c.whatsapp ?? "",
      cargo_id: c.cargo_id ?? "",
      unidade_id: c.unidade_id ?? "",
      data_admissao: c.data_admissao ?? "",
      data_nascimento: c.data_nascimento ?? "",
      data_desligamento: c.data_desligamento ?? "",
      motivo_desligamento: c.motivo_desligamento ?? NONE_DESLIG,
      elegivel_recontratacao: c.elegivel_recontratacao ?? NONE_DESLIG,
      observacao_desligamento: c.observacao_desligamento ?? "",
      
      tipo_vinculo:
        (c.vinculo_label && TIPOS_VINCULO.some((t) => t.value === c.vinculo_label)
          ? String(c.vinculo_label)
          : c.regime
            ? REGIME_TO_VINCULO[String(c.regime)] ?? "CLT"
            : "CLT"),
      folga_fixa_semana: c.folga_fixa_semana != null ? String(c.folga_fixa_semana) : "none",
      perfil_acesso: c.perfil_acesso ?? "colaborador",
      ativo: c.ativo ?? true,
      possui_folha_ponto: c.possui_folha_ponto ?? false,
      optante_adiantamento: c.optante_adiantamento ?? false,
    });
  }, [open, colaborador, atribuicoes]);

  const regimeSelecionado = VINCULO_TO_REGIME[form.tipo_vinculo] ?? "clt";

  // Mudar o vínculo pode invalidar a forma de pagamento (ex.: intermitente não
  // é mensalista): reconciliamos sempre pela política do contrato.
  useEffect(() => {
    cienciaConfirmada.current = null;
    setRem((r) => {
      const ajustada = ajustarFormaPagamento(regimeSelecionado, r.forma_pagamento) as FormaPagamento;
      return ajustada === r.forma_pagamento ? r : { ...r, forma_pagamento: ajustada };
    });
  }, [regimeSelecionado]);

  const unidadeSelecionada = (unidades.data ?? []).find((u) => u.id === form.unidade_id) as any;
  const cargoSelecionado = (cargos.data ?? []).find((c) => c.id === form.cargo_id) as any;
  const salarioCargo = cargoSelecionado?.salario_base ?? null;

  // Trocar o cargo ou o salário exige revalidar a regra "um cargo = um salário".
  useEffect(() => {
    cargoResolvido.current = false;
  }, [form.cargo_id, rem.salario_base, rem.base_salarial, rem.forma_pagamento]);

  /** Base mensal usada para comparar com o salário de referência do cargo. */
  const baseSalarialInformada = () => {
    const usaBase = rem.forma_pagamento === "horista" || rem.forma_pagamento === "diarista";
    return usaBase ? numeroBR(rem.base_salarial) : numeroBR(rem.salario_base);
  };

  /** Vincula o cargo criado/escolhido pelos diálogos auxiliares. */
  const selecionarCargo = (cargo: DpCargo) => {
    setForm((f) => ({ ...f, cargo_id: cargo.id }));
    cargoResolvido.current = true;
  };



  // Adiantamento depende do contrato e da forma de pagamento (intermitente não tem).
  const permiteAdiantamento =
    policy.permiteAdiantamento &&
    permiteAdiantamentoRemuneracao(VINCULO_TO_REGIME[form.tipo_vinculo], rem.forma_pagamento);

  useEffect(() => {
    if (!permiteAdiantamento) {
      setForm((f) => (f.optante_adiantamento ? { ...f, optante_adiantamento: false } : f));
      return;
    }
    if (unidadeSelecionada?.tem_adiantamento && !isEdit) {
      setForm((f) => (f.optante_adiantamento ? f : { ...f, optante_adiantamento: true }));
    }
  }, [unidadeSelecionada?.tem_adiantamento, isEdit, permiteAdiantamento]);



  /** Registra a ciência do risco jurídico em dp_regras_historico. */
  const registrarCiencia = async (justificativa: string) => {
    if (!selectedCompanyId) return;
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) return;
      await supabase.from("dp_regras_historico").insert({
        company_id: selectedCompanyId,
        usuario_id: auth.user.id,
        tabela: "dp_colaboradores",
        registro_id: colaborador?.id ?? null,
        valor_antigo: null as never,
        valor_novo: {
          vinculo: form.tipo_vinculo,
          regime: regimeSelecionado,
          nome: form.nome.trim(),
          cpf: form.cpf.replace(/\D/g, ""),
        } as never,
        justificativa: justificativa || null,
        ciencia_confirmada: true,
      });
    } catch { /* o cadastro não deve falhar por causa do log */ }
  };

  const submit = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.cpf.trim()) { toast.error("CPF é obrigatório"); return; }

    const cpfDigits = form.cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) { toast.error("CPF deve ter 11 dígitos"); return; }
    if (!isValidCpf(cpfDigits)) { toast.error("CPF inválido"); return; }

    if (!form.cargo_id) { toast.error("Cargo é obrigatório"); return; }
    if (!form.unidade_id) { toast.error("Unidade é obrigatória"); return; }
    if (!form.data_admissao) { toast.error("Data de admissão é obrigatória"); return; }
    if (!form.data_nascimento) { toast.error("Data de nascimento é obrigatória"); return; }

    // Regras de datas
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const nascimento = new Date(form.data_nascimento + "T00:00:00");
    const admissao = new Date(form.data_admissao + "T00:00:00");

    if (nascimento >= hoje) { toast.error("Data de nascimento deve ser no passado"); return; }

    const idade = (admissao.getTime() - nascimento.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (idade < 14) { toast.error("Colaborador deve ter no mínimo 14 anos na admissão"); return; }
    if (idade > 100) { toast.error("Data de nascimento inconsistente com a admissão"); return; }

    if (admissao > hoje) {
      // permite admissão futura até 90 dias
      const diffDias = (admissao.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDias > 90) { toast.error("Data de admissão muito distante no futuro (máx. 90 dias)"); return; }
    }




    // Duplicidade de CPF na empresa
    try {
      const { data: dup } = await (await import("@/integrations/supabase/client")).supabase
        .from("dp_colaboradores")
        .select("id")
        .eq("cpf", cpfDigits)
        .maybeSingle();
      if (dup && dup.id !== colaborador?.id) {
        toast.error("Já existe um colaborador com este CPF nesta empresa");
        return;
      }
    } catch { /* silencioso — o banco tem constraint de reserva */ }

    if (isDesligado && !form.data_desligamento) {
      toast.error("Informe a data da demissão");
      return;
    }
    if (form.observacao_desligamento.length > 2000) {
      toast.error("Observação do desligamento muito longa (máx. 2000 caracteres)");
      return;
    }

    const cargoNome = (cargos.data ?? []).find((c) => c.id === form.cargo_id)?.nome ?? null;

    // Remuneração é pré-requisito da folha: bloqueia o cadastro sem valor.
    const salarioNum = numeroBR(rem.salario_base);
    const valorHoraNum = numeroBR(rem.valor_hora);
    const pendencia = remuneracaoPendente({
      forma_pagamento: rem.forma_pagamento,
      salario_base: salarioNum || null,
      valor_hora: valorHoraNum || null,
      salario_cargo: salarioCargo,
    });
    if (pendencia) { toast.error(pendencia); return; }

    const adicionalNum = numeroBR(rem.adicional_percentual);
    if (adicionalNum < 0 || adicionalNum > 100) {
      toast.error("Adicional deve estar entre 0% e 100%");
      return;
    }
    const vtDiaNum = numeroBR(rem.vale_transporte_valor_dia);
    if (rem.vale_transporte && vtDiaNum <= 0) {
      toast.error("Informe o valor diário do vale-transporte");
      return;
    }

    // Base de cálculo só se aplica a horista/diarista.
    const usaBaseCalculo = rem.forma_pagamento === "horista" || rem.forma_pagamento === "diarista";
    const premioNum = numeroBR(rem.premio_assiduidade_valor);
    if (rem.premio_assiduidade && premioNum <= 0) {
      toast.error("Informe o valor do prêmio de assiduidade");
      return;
    }


    // Um cargo = um salário: reconcilia o cargo antes de gravar o colaborador.
    if (!cargoResolvido.current) {
      const comparacao = compararSalarioCargo(cargoSelecionado, baseSalarialInformada());
      if (comparacao.status === "cargo_sem_salario") {
        const definir = window.confirm(
          `Definir ${moedaBR(comparacao.salarioInformado)} como salário de referência do cargo ` +
            `${cargoSelecionado?.nome ?? ""}?`,
        );
        if (definir) {
          try {
            await upsertCargo.mutateAsync({
              id: form.cargo_id,
              nome: cargoSelecionado.nome,
              salario_base: comparacao.salarioInformado,
            } as Parameters<typeof upsertCargo.mutateAsync>[0]);
          } catch (e) {
            toast.error("Não foi possível gravar o salário do cargo", {
              description: e instanceof Error ? e.message : String(e),
            });
            return;
          }
        }
        cargoResolvido.current = true;
      } else if (comparacao.status === "divergente") {
        setConflitoCargo({
          salarioCargo: comparacao.salarioCargo,
          salarioInformado: comparacao.salarioInformado,
        });
        return;
      } else {
        cargoResolvido.current = true;
      }
    }

    // Vínculo sem registro em carteira exige ciência formal do risco jurídico.
    if (policy.exigeCienciaLegal && !cienciaConfirmada.current) {
      setCienciaAberta(true);
      return;
    }


    try {
      const colaboradorId = await upsert.mutateAsync({
        id: colaborador?.id ?? criadoId ?? undefined,
        nome: form.nome.trim(),
        cpf: form.cpf.replace(/\D/g, "") || null,
        matricula: form.matricula.trim() || null,
        cargo: cargoNome,
        cargo_id: form.cargo_id,
        unidade_id: form.unidade_id,
        regime: regimeSelecionado,
        vinculo_label: form.tipo_vinculo,
        data_admissao: form.data_admissao || null,
        data_nascimento: form.data_nascimento || null,
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,

        perfil_acesso: form.perfil_acesso,
        folga_fixa_semana:
          policy.exigeFolgaSemanal && form.folga_fixa_semana !== "none"
            ? Number(form.folga_fixa_semana)
            : null,

        possui_folha_ponto: form.possui_folha_ponto,
        optante_adiantamento: permiteAdiantamento ? form.optante_adiantamento : false,

        forma_pagamento: rem.forma_pagamento,
        salario_base: rem.forma_pagamento === "horista" ? null : salarioNum || null,
        valor_hora: rem.forma_pagamento === "horista" ? valorHoraNum || null : null,
        dependentes_irrf: Math.max(0, Math.trunc(numeroBR(rem.dependentes_irrf))),
        adicional_percentual: adicionalNum,
        vale_transporte: rem.vale_transporte,
        vale_transporte_valor_dia: rem.vale_transporte ? vtDiaNum : null,

        // Base de cálculo do valor da hora/dia
        base_salarial: usaBaseCalculo ? numeroBR(rem.base_salarial) || null : null,
        base_horas_mes: numeroBR(rem.base_horas_mes) || BASE_HORAS_MES_PADRAO,
        base_dias_mes: numeroBR(rem.base_dias_mes) || BASE_DIAS_MES_PADRAO,
        valor_hora_manual: usaBaseCalculo ? rem.valor_hora_manual : false,

        // Assiduidade e pontualidade
        premio_assiduidade: rem.premio_assiduidade,
        premio_assiduidade_valor: rem.premio_assiduidade ? premioNum || null : null,
        assiduidade_criterio: rem.premio_assiduidade ? rem.assiduidade_criterio : null,
        assiduidade_tolerancia_min: Math.max(0, Math.trunc(numeroBR(rem.assiduidade_tolerancia_min))),
        assiduidade_max_atrasos: rem.premio_assiduidade
          ? Math.max(0, Math.trunc(numeroBR(rem.assiduidade_max_atrasos)))
          : null,
        ...(isDesligado
          ? {
              data_desligamento: form.data_desligamento,
              motivo_desligamento:
                form.motivo_desligamento === NONE_DESLIG ? null : form.motivo_desligamento,
              elegivel_recontratacao:
                form.elegivel_recontratacao === NONE_DESLIG ? null : form.elegivel_recontratacao,
              observacao_desligamento: form.observacao_desligamento.trim() || null,
            }
          : {}),
      } as any);


      // Sincroniza a ficha de benefícios marcada no cadastro.
      const hoje = new Date().toISOString().slice(0, 10);
      for (const b of beneficios) {
        const marcado = !!rem.beneficios[b.id];
        const atual = (atribuicoes ?? []).find(
          (a: any) => a.colaborador_id === colaboradorId && a.beneficio_id === b.id,
        ) as any;
        if (!marcado && !atual) continue;
        if (!!atual?.ativo === marcado) continue;
        await saveAtribuicao.mutateAsync({
          id: atual?.id,
          colaborador_id: colaboradorId,
          beneficio_id: b.id,
          valor: Number(atual?.valor ?? b.valor_padrao ?? 0),
          desconto_valor: Number(atual?.desconto_valor ?? 0),
          data_inicio: atual?.data_inicio ?? hoje,
          data_fim: atual?.data_fim ?? null,
          ativo: marcado,
          observacao: atual?.observacao ?? null,
        });
      }

      if (isEdit || criadoId) {
        // Botão único: grava também o horário de trabalho quando houve mudança.
        const salvarJornada = jornadaSalvarRef.current;
        const resultado = salvarJornada ? await salvarJornada() : "nada";
        if (resultado === "pendente_ciencia") {
          setTab("jornada");
          return;
        }
        if (resultado === "erro") { setTab("jornada"); return; }
        toast.success("Colaborador atualizado");
        onOpenChange(false);
        return;
      }


      // Cadastro novo: o registro passa a existir, então a jornada já pode ser
      // gravada sem sair da tela — levamos o administrador para a aba de turno.
      setCriadoId(colaboradorId);
      setTab("jornada");
      toast.success("Colaborador cadastrado — defina o turno e a jornada");

    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="jornada">Horário de Trabalho</TabsTrigger>
            <TabsTrigger value="remuneracao">Remuneração</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="mt-0">


        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {/* Nome */}
          <div className="col-span-2 space-y-2">
            <Label>Nome Completo *</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: João da Silva"
            />
          </div>

          {/* CPF / Matrícula */}
          <div className="space-y-2">
            <Label>CPF *</Label>
            <Input
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </div>
          <div className="space-y-2">
            <Label>Matrícula</Label>
            <Input
              value={form.matricula}
              onChange={(e) => setForm({ ...form, matricula: e.target.value })}
              placeholder="Ex: 1234"
            />
          </div>

          {/* Email / WhatsApp */}
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@exemplo.com"
            />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              placeholder="(62) 99999-9999"
            />
          </div>

          {/* Cargo / Unidade */}
          <div className="space-y-2">
            <Label>Cargo *</Label>
            <div className="flex gap-2">
              <Select value={form.cargo_id} onValueChange={(v) => setForm({ ...form, cargo_id: v })}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                <SelectContent>
                  {(cargos.data ?? []).map((c) => {
                    const ref = salarioReferencia(c as any);
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}{ref ? ` — ${moedaBR(ref)}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" className="shrink-0" onClick={() => setNovoCargoOpen(true)}>
                Novo cargo
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cada cargo tem um único salário de referência. Cargos criados aqui já entram na tela de Cargos.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Unidade *</Label>
            <Select value={form.unidade_id} onValueChange={(v) => setForm({ ...form, unidade_id: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                {(unidades.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Datas */}
          <div className="space-y-2">
            <Label>Data de Admissão *</Label>
            <Input
              type="date"
              value={form.data_admissao}
              onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Data de Nascimento *</Label>
            <Input
              type="date"
              value={form.data_nascimento}
              onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
            />
          </div>

          {/* Tipo de Vínculo (o regime do banco é derivado deste campo) */}
          <div className="space-y-2">
            <Label>Tipo de Vínculo</Label>
            <Select
              value={form.tipo_vinculo}
              onValueChange={(v) => setForm({ ...form, tipo_vinculo: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_VINCULO.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Folga Fixa / Perfil */}
          {policy.exigeFolgaSemanal ? (
            <div className="space-y-2">
              <Label>Folga Fixa Semanal</Label>
              <Select
                value={form.folga_fixa_semana}
                onValueChange={(v) => setForm({ ...form, folga_fixa_semana: v })}
              >
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  {DIAS_SEMANA.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Folga Fixa Semanal</Label>
              <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                {policy.jornadaComoDisponibilidade
                  ? "No contrato intermitente não há folga fixa: os dias trabalhados nascem das convocações aceitas."
                  : "Não se aplica a este tipo de vínculo."}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Perfil de Acesso</Label>
            <Select
              value={form.perfil_acesso}
              onValueChange={(v: any) => setForm({ ...form, perfil_acesso: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="colaborador">Colaborador</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>


          {/* Folha de ponto (condicional) */}
          {unidadeSelecionada?.possui_relogio_ponto && (
            <div className="col-span-2 flex items-center gap-3 rounded-xl border border-border p-3">
              <Switch
                id="possui_folha_ponto"
                checked={form.possui_folha_ponto}
                onCheckedChange={(v) => setForm({ ...form, possui_folha_ponto: v })}
              />
              <Label htmlFor="possui_folha_ponto" className="cursor-pointer">Possui Folha de Ponto</Label>
            </div>
          )}


          {/* Desligamento (editável quando o colaborador está desligado) */}
          {isDesligado && (
            <div className="col-span-2 space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <div className="text-sm font-semibold text-destructive">Dados Do Desligamento</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Data da demissão *</Label>
                  <Input
                    type="date"
                    value={form.data_desligamento}
                    onChange={(e) => setForm({ ...form, data_desligamento: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo do desligamento</Label>
                  <Select
                    value={form.motivo_desligamento}
                    onValueChange={(v) => setForm({ ...form, motivo_desligamento: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_DESLIG}>Não informar</SelectItem>
                      {MOTIVO_DESLIGAMENTO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Recontrataria?</Label>
                  <Select
                    value={form.elegivel_recontratacao}
                    onValueChange={(v) => setForm({ ...form, elegivel_recontratacao: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_DESLIG}>Não informar</SelectItem>
                      {ELEGIBILIDADE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Considerações do desligamento</Label>
                <Textarea
                  rows={3}
                  maxLength={2000}
                  placeholder="Notas internas para futuras avaliações de recontratação..."
                  value={form.observacao_desligamento}
                  onChange={(e) => setForm({ ...form, observacao_desligamento: e.target.value })}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Alterar a data recalcula o prazo de acesso ao portal. Use a ação “Reintegrar” na lista para reativar o colaborador.
              </p>
            </div>
          )}

          {/* Senha Inicial */}
          {!isEdit && (
            <div className="col-span-2 space-y-2">
              <Label>Senha Inicial</Label>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground font-mono">
                Padrão: 6 últimos dígitos do CPF
              </div>
            </div>
          )}
            </div>
          </TabsContent>

          <TabsContent value="jornada" className="mt-4">
            <ColaboradorJornadaPanel
              colaborador={{
                id: colaborador?.id ?? criadoId ?? null,
                nome: form.nome,
                regime: regimeSelecionado,
                unidade_id: form.unidade_id || null,
                data_admissao: form.data_admissao || null,
                data_nascimento: form.data_nascimento || null,
              }}
              active={tab === "jornada"}
            />
          </TabsContent>


          <TabsContent value="remuneracao" className="mt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Remuneração e benefícios — base da folha de pagamento */}
              <RemuneracaoFields
                value={rem}
                onChange={patchRem}
                salarioCargo={salarioCargo}
                cargoInsalubre={!!cargoSelecionado?.insalubridade || !!cargoSelecionado?.periculosidade}
                regime={regimeSelecionado}
                beneficios={beneficios}
              />

              {/* Adiantamento — apenas para contratos com salário mensal em folha */}
              {permiteAdiantamento ? (
                <div className="col-span-2 flex items-center gap-3 rounded-xl border border-border p-3">
                  <Switch
                    id="optante_adiantamento"
                    checked={form.optante_adiantamento}
                    onCheckedChange={(v) => setForm({ ...form, optante_adiantamento: v })}
                  />
                  <Label htmlFor="optante_adiantamento" className="cursor-pointer">Opta por Adiantamento Salarial</Label>
                  {unidadeSelecionada?.tem_adiantamento && unidadeSelecionada?.dia_adiantamento && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      Dia do adiantamento: {unidadeSelecionada.dia_adiantamento}
                    </span>
                  )}
                </div>
              ) : (
                <p className="col-span-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <strong className="text-foreground">Adiantamento salarial não se aplica.</strong>{" "}
                  {policy.adiantamentoHint}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            {criadoId ? "Concluir" : "Cancelar"}
          </Button>
          <Button onClick={submit} disabled={upsert.isPending}>
            {upsert.isPending ? "Salvando..." : isEdit || criadoId ? "Atualizar" : "Criar"}
          </Button>
        </DialogFooter>

      </DialogContent>

      <CienciaLegalDialog
        open={cienciaAberta}
        titulo="Vínculo sem registro em carteira"
        alertas={
          policy.cienciaLegalMensagem
            ? [{ campo: "vinculo", mensagem: policy.cienciaLegalMensagem }]
            : []
        }
        onCancel={() => setCienciaAberta(false)}
        onConfirm={async (justificativa) => {
          cienciaConfirmada.current = { justificativa };
          setCienciaAberta(false);
          await registrarCiencia(justificativa);
          await submit();
        }}
      />

      <CargoQuickCreateDialog
        open={novoCargoOpen}
        onOpenChange={setNovoCargoOpen}
        salarioInicial={baseSalarialInformada() || null}
        onCreated={selecionarCargo}
      />

      {conflitoCargo && (
        <CargoSalarioConflitoDialog
          open
          onOpenChange={(v) => { if (!v) setConflitoCargo(null); }}
          cargoNome={cargoSelecionado?.nome ?? ""}
          salarioCargo={conflitoCargo.salarioCargo}
          salarioInformado={conflitoCargo.salarioInformado}
          nomeSugerido={sugerirNomeVariacao(cargoSelecionado?.nome ?? "", (cargos.data ?? []) as any)}
          saving={upsertCargo.isPending}
          onCriarVariacao={async (nome) => {
            try {
              const cargo = await upsertCargo.mutateAsync({
                nome,
                cbo: cargoSelecionado?.cbo ?? null,
                insalubre_periculoso:
                  !!cargoSelecionado?.insalubridade || !!cargoSelecionado?.periculosidade,
                salario_base: conflitoCargo.salarioInformado,
              } as Parameters<typeof upsertCargo.mutateAsync>[0]);
              selecionarCargo(cargo);
              setConflitoCargo(null);
              toast.success("Cargo criado e vinculado. Salve para concluir.");
            } catch (e) {
              toast.error("Não foi possível criar a variação do cargo", {
                description: e instanceof Error ? e.message : String(e),
              });
            }
          }}
          onUsarSalarioDoCargo={() => {
            const valor = conflitoCargo.salarioCargo;
            const texto = valor.toFixed(2).replace(".", ",");
            const usaBase = rem.forma_pagamento === "horista" || rem.forma_pagamento === "diarista";
            patchRem(usaBase ? { base_salarial: texto } : { salario_base: texto });
            cargoResolvido.current = true;
            setConflitoCargo(null);
            toast.info("Salário ajustado para o valor do cargo. Salve para concluir.");
          }}
        />
      )}
    </Dialog>

  );
}

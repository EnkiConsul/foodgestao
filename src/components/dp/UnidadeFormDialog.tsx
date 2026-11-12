import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HandCoins, Loader2, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { UnidadeTabsBar } from "@/components/dp/unidades/UnidadeTabsBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useUpsertDpUnidade, type DpUnidade } from "@/hooks/useDpCadastros";
import { supabase } from "@/integrations/supabase/client";
import { HorarioFuncionamentoEditor } from "@/components/dp/HorarioFuncionamentoEditor";
import { UnidadeSindicatoPanel } from "@/components/dp/unidades/UnidadeSindicatoPanel";
import { UnidadeNegociacoesPanel } from "@/components/dp/unidades/UnidadeNegociacoesPanel";
import { UnidadeSetoresPanel } from "@/components/dp/unidades/UnidadeSetoresPanel";
import { UnidadeFeriadosPanel } from "@/components/dp/unidades/UnidadeFeriadosPanel";
import { EnderecoFields } from "@/components/shared/EnderecoFields";
import { maskCep } from "@/lib/endereco";
import { parseEnderecoTexto } from "@/lib/dp/ficha-registro/endereco-parse";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import {
  AVISO_ART74,
  MIN_JUSTIFICATIVA_PONTO,
  justificativaValida,
  pontoObrigatorioPorLotacao,
} from "@/lib/dp/ponto-conformidade";
import { POLITICA_LABEL, politicaPedeData, registrarPeriodosPolitica, type PoliticaUnidade } from "@/lib/dp/unidadePoliticas";
import { forcarRecargaPendencias } from "@/lib/dp/pendencias-resolver";
import { proximaEtapaUnidade, type UnidadeEtapa } from "@/lib/dp/unidade-etapas";


export const onlyNumbers = (v: string) => v.replace(/\D/g, "");

export const formatCNPJ = (value: string) => {
  const c = onlyNumbers(value);
  if (c.length <= 2) return c;
  if (c.length <= 5) return c.replace(/^(\d{2})(\d{0,3})/, "$1.$2");
  if (c.length <= 8) return c.replace(/^(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
  if (c.length <= 12) return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
};

const blank = {
  company_id: "",
  nome: "",
  cnpj: "",
  endereco: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  ativo: true,
  telefone: "",
  possui_relogio_ponto: false,
  tem_adiantamento: false,
  dia_adiantamento: "" as string,
  adiantamento_antecedencia_dias: "5" as string,
  adiantamento_aviso: "alteracoes" as "alteracoes" | "relacao_mensal",
  pagamento_salario_tipo: "" as "" | "quinto_dia_util" | "dia_fixo",
  pagamento_salario_dia: "" as string,
  banco_horas: false,
  compensa_feriados: false,
  convoca_feriados_automatico: false,
  compensacao_feriado_antecedencia_dias: "2",
  ciencia_sindical: false,
};

/** Unidade em edição — o mínimo que o formulário precisa para carregar. */
export interface UnidadeEdicao {
  id: string;
  company_id?: string | null;
  nome: string;
  cnpj?: string | null;
  endereco?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  ativo: boolean;
  telefone?: string | null;
  possui_relogio_ponto?: boolean | null;
  relogio_ponto_dispensa_justificativa?: string | null;
  tem_adiantamento?: boolean | null;
  dia_adiantamento?: number | null;
  adiantamento_antecedencia_dias?: number | null;
  adiantamento_aviso?: string | null;
  pagamento_salario_tipo?: string | null;
  pagamento_salario_dia?: number | null;
  banco_horas?: boolean | null;
  compensa_feriados?: boolean | null;
  convoca_feriados_automatico?: boolean | null;
  compensacao_feriado_antecedencia_dias?: number | null;
  compensacao_sindical_ciencia_em?: string | null;
}

/** Abas do cadastro de unidade. */
export type UnidadeAba = UnidadeEtapa;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, o formulário abre em modo edição. */
  unidade?: UnidadeEdicao | null;
  /** Nome sugerido no cadastro (usado no atalho do colaborador). */
  nomeInicial?: string;
  /** Dados já conhecidos (ex.: lidos da ficha de registro) para pré-preencher uma unidade nova. */
  inicial?: Partial<typeof blank>;
  /** Recebe a unidade salva — usado para selecioná-la de imediato. */
  onSaved?: (unidade: DpUnidade) => void;
  /** Abre direto numa aba (ex.: atalho "Funcionamento" do card da unidade). */
  abaInicial?: UnidadeAba;
}

/**
 * Cadastro de unidade reaproveitado pela tela de Unidades e pelo atalho
 * "Nova unidade" do cadastro do colaborador: a unidade nasce no mesmo lugar,
 * com as mesmas regras, venha de onde vier.
 */
export function UnidadeFormDialog({ open, onOpenChange, unidade = null, nomeInicial = "", inicial, onSaved, abaInicial = "dados" }: Props) {
  const { companies } = useCompanyContext();
  const upsert = useUpsertDpUnidade();
  const qc = useQueryClient();
  const [form, setForm] = useState(blank);
  const [loadingBrasilApi, setLoadingBrasilApi] = useState(false);

  const applyCompanyData = async (companyId: string, force = false) => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("name, trade_name, cnpj, phone, whatsapp, cep, logradouro, numero, complemento, bairro, cidade, uf, address")
        .eq("id", companyId)
        .maybeSingle();
      if (error || !data) return;
      const enderecoMontado =
        [
          [data.logradouro, data.numero].filter(Boolean).join(", "),
          data.complemento,
          data.bairro,
          data.cep,
        ]
          .filter(Boolean)
          .join(" - ") || data.address || "";
      let cidade = data.cidade || "";
      let uf = data.uf || "";
      let endereco = enderecoMontado;
      let telefone = data.phone || data.whatsapp || "";

      // Fallback: se a empresa não tem cidade/UF estruturados, consulta CNPJ na BrasilAPI
      const cnpjDigits = onlyNumbers(data.cnpj || "");
      if ((!cidade || !uf) && cnpjDigits.length === 14) {
        setLoadingBrasilApi(true);
        try {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`);
          if (res.ok) {
            const info: any = await res.json();
            if (!cidade) cidade = info.municipio || "";
            if (!uf) uf = info.uf || "";
            if (!endereco) {
              endereco = [
                [info.logradouro, info.numero].filter(Boolean).join(", "),
                info.complemento,
                info.bairro,
                info.cep,
              ].filter(Boolean).join(" - ");
            }
            if (!telefone) telefone = info.ddd_telefone_1 || "";
          }
        } catch { /* ignore */ }
        finally { setLoadingBrasilApi(false); }
      }

      setForm((prev) => ({
        ...prev,
        nome: force || !prev.nome ? (data.trade_name || data.name || prev.nome) : prev.nome,
        cnpj: force || !prev.cnpj ? cnpjDigits : prev.cnpj,
        endereco: force || !prev.endereco ? endereco : prev.endereco,
        cep: force || !prev.cep ? maskCep(data.cep || "") : prev.cep,
        logradouro: force || !prev.logradouro ? (data.logradouro || "") : prev.logradouro,
        numero: force || !prev.numero ? (data.numero || "") : prev.numero,
        complemento: force || !prev.complemento ? (data.complemento || "") : prev.complemento,
        bairro: force || !prev.bairro ? (data.bairro || "") : prev.bairro,
        cidade: force || !prev.cidade ? cidade : prev.cidade,
        uf: force || !prev.uf ? (uf || "").toUpperCase().slice(0, 2) : prev.uf,
        telefone: force || !prev.telefone ? telefone : prev.telefone,
      }));
    } catch {
      /* ignore */
    }
  };

  // Carrega o formulário sempre que o diálogo abre.
  const [criadaId, setCriadaId] = useState<string | null>(null);
  const [aba, setAba] = useState<UnidadeAba>(abaInicial);
  const salvarFuncionamento = useRef<(() => Promise<void>) | null>(null);
  const registrarSalvar = useCallback((fn: (() => Promise<void>) | null) => {
    salvarFuncionamento.current = fn;
  }, []);

  /**
   * Última versão gravada da unidade. Com "Salvar e avançar" o diálogo segue
   * aberto: as comparações (ponto, políticas, ciência sindical) partem do que
   * acabou de ser salvo, não do que estava gravado quando o diálogo abriu.
   */
  const [gravada, setGravada] = useState<UnidadeEdicao | null>(null);

  useEffect(() => {
    if (!open) return;
    setCriadaId(null);
    setGravada(unidade ?? null);
    setAba(unidade ? abaInicial : "dados");
    if (unidade) {
      // Endereço antigo gravado em uma linha só é aproveitado nos campos novos.
      const lido = parseEnderecoTexto(unidade.endereco);
      setForm({
        company_id: unidade.company_id ?? "",
        nome: unidade.nome,
        cnpj: unidade.cnpj ?? "",
        endereco: unidade.endereco ?? "",
        cep: unidade.cep ?? lido.cep ?? "",
        logradouro: unidade.logradouro ?? lido.logradouro ?? "",
        numero: unidade.numero ?? lido.numero ?? "",
        complemento: unidade.complemento ?? "",
        bairro: unidade.bairro ?? lido.bairro ?? "",
        cidade: unidade.cidade ?? lido.cidade ?? "",
        uf: unidade.uf ?? lido.uf ?? "",
        ativo: unidade.ativo,
        telefone: unidade.telefone ?? "",
        possui_relogio_ponto: unidade.possui_relogio_ponto ?? false,
        tem_adiantamento: unidade.tem_adiantamento ?? false,
        dia_adiantamento: unidade.dia_adiantamento != null ? String(unidade.dia_adiantamento) : "",
        adiantamento_antecedencia_dias: String(unidade.adiantamento_antecedencia_dias ?? 5),
        adiantamento_aviso: unidade.adiantamento_aviso === "relacao_mensal" ? "relacao_mensal" : "alteracoes",
        pagamento_salario_tipo:
          unidade.pagamento_salario_tipo === "quinto_dia_util" || unidade.pagamento_salario_tipo === "dia_fixo"
            ? unidade.pagamento_salario_tipo
            : "",
        pagamento_salario_dia: unidade.pagamento_salario_dia != null ? String(unidade.pagamento_salario_dia) : "",
        banco_horas: unidade.banco_horas ?? false,
        compensa_feriados: unidade.compensa_feriados ?? false,
        convoca_feriados_automatico: unidade.convoca_feriados_automatico ?? false,
        compensacao_feriado_antecedencia_dias: String(unidade.compensacao_feriado_antecedencia_dias ?? 2),
        ciencia_sindical: !!unidade.compensacao_sindical_ciencia_em,
      });
      return;
    }
    // Nova unidade abre em branco: só a empresa é pré-selecionada quando há uma só.
    const only = companies.length === 1 ? companies[0].id : "";
    const base = { ...blank, company_id: only, nome: nomeInicial, ...(inicial ?? {}) };
    setForm(base);
    // Empresa já conhecida (ex.: lote de fichas): traz endereço e contato dela nos campos vazios.
    if (inicial?.company_id) void applyCompanyData(inicial.company_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unidade?.id, nomeInicial]);

  const unidadeId = unidade?.id ?? criadaId;

  // Conformidade do ponto (Art. 74 CLT) — decisão da unidade, herdada pelos colaboradores.
  const [justificativaPonto, setJustificativaPonto] = useState("");
  useEffect(() => {
    if (open) setJustificativaPonto(unidade?.relogio_ponto_dispensa_justificativa ?? "");
  }, [open, unidade?.id, unidade?.relogio_ponto_dispensa_justificativa]);
  const lotacao = useQuery({
    queryKey: ["dp_unidade_lotacao", unidadeId],
    enabled: open && !!unidadeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("dp_colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("unidade_id", unidadeId!)
        .eq("ativo", true)
        .is("deleted_at", null)
        .is("data_desligamento", null);
      return count ?? 0;
    },
  });
  const ativosUnidade = lotacao.data ?? 0;
  const pontoObrigatorio = pontoObrigatorioPorLotacao(ativosUnidade);
  const compensacaoAtiva = form.banco_horas || form.compensa_feriados;
  const cienciaNova = form.ciencia_sindical && !gravada?.compensacao_sindical_ciencia_em;
  const pontoOriginal = gravada?.possui_relogio_ponto ?? false;
  const pontoAlterado = !!gravada && form.possui_relogio_ponto !== pontoOriginal;
  const justificativaAlterada =
    justificativaPonto.trim() !== (gravada?.relogio_ponto_dispensa_justificativa ?? "").trim();

  // Data de início (ao ligar) ou de fim (ao desligar) de cada política da unidade.
  const [datasPolitica, setDatasPolitica] = useState<Partial<Record<PoliticaUnidade, string>>>({});
  useEffect(() => { if (open) setDatasPolitica({}); }, [open, unidade?.id]);
  const unidadeNova = !gravada;
  const politicasForm: { politica: PoliticaUnidade; original: boolean | null | undefined; atual: boolean }[] = [
    { politica: "relogio_ponto", original: gravada?.possui_relogio_ponto, atual: form.possui_relogio_ponto },
    { politica: "banco_horas", original: gravada?.banco_horas, atual: form.banco_horas },
    { politica: "compensa_feriados", original: gravada?.compensa_feriados, atual: form.compensa_feriados },
    { politica: "adiantamento", original: gravada?.tem_adiantamento, atual: form.tem_adiantamento },
  ];
  const politicasPendentes = politicasForm.filter((p) => politicaPedeData(p.original, p.atual, unidadeNova));
  const campoData = (politica: PoliticaUnidade, ativo: boolean) => {
    if (!politicasPendentes.some((p) => p.politica === politica)) return null;
    const id = `data_${politica}`;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs">{ativo ? "Data de Início *" : "Data de Fim *"}</Label>
        <Input
          id={id}
          type="date"
          className="w-full sm:w-44"
          value={datasPolitica[politica] ?? ""}
          onChange={(e) => setDatasPolitica((d) => ({ ...d, [politica]: e.target.value }))}
        />
      </div>
    );
  };

  /**
   * Grava a unidade. "fechar" encerra o diálogo (unidade nova segue para a
   * próxima etapa, como sempre); "avancar" grava e abre a etapa seguinte.
   */
  const save = async (modo: "fechar" | "avancar" = "fechar") => {
    if (!form.company_id) {
      toast.error("Selecione a empresa vinculada");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (compensacaoAtiva && !form.ciencia_sindical) {
      toast.error("Confirme a negociação com o sindicato", {
        description: "Banco de horas e compensação de feriados precisam estar previstos na convenção ou acordo coletivo. Marque a confirmação para salvar.",
      });
      return;
    }
    if (pontoObrigatorio && !form.possui_relogio_ponto && !justificativaValida(justificativaPonto)) {
      setAba("dados");
      toast.error("Justifique a dispensa do relógio de ponto", {
        description: `A unidade tem mais de 20 colaboradores ativos (Art. 74 da CLT). Escreva pelo menos ${MIN_JUSTIFICATIVA_PONTO} letras.`,
      });
      return;
    }
    if (form.pagamento_salario_tipo === "dia_fixo" && !form.pagamento_salario_dia) {
      setAba("dados");
      toast.error("Informe o dia do pagamento do salário");
      return;
    }
    const semData = politicasPendentes.find((p) => !datasPolitica[p.politica]);
    if (semData) {
      setAba("dados");
      toast.error(`Informe a data ${semData.atual ? "de início" : "de fim"}: ${POLITICA_LABEL[semData.politica]}`, {
        description: "A data garante que ponto, banco de horas, feriados e adiantamento sejam calculados no período correto.",
      });
      return;
    }
    try {
      const cienciaEm = compensacaoAtiva && cienciaNova ? new Date().toISOString() : null;
      const salva = await upsert.mutateAsync({
        id: unidadeId ?? undefined,
        company_id: form.company_id,
        nome: form.nome.trim(),
        cnpj: onlyNumbers(form.cnpj) || null,
        // Linha única mantida para telas e relatórios que mostram o endereço em texto.
        endereco:
          [
            [form.logradouro.trim(), form.numero.trim()].filter(Boolean).join(", "),
            form.complemento.trim(),
            form.bairro.trim(),
            form.cep.trim(),
          ]
            .filter(Boolean)
            .join(" - ") || form.endereco.trim() || null,
        cep: form.cep.trim() || null,
        logradouro: form.logradouro.trim() || null,
        numero: form.numero.trim() || null,
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim() || null,
        cidade: form.cidade.trim() || null,
        uf: form.uf.trim().toUpperCase() || null,
        ativo: form.ativo,
        telefone: form.telefone.trim() || null,
        // Unidade existente: o ponto é gravado pela rotina com cascata abaixo.
        ...(unidadeId ? {} : { possui_relogio_ponto: form.possui_relogio_ponto }),
        tem_adiantamento: form.tem_adiantamento,
        dia_adiantamento: form.dia_adiantamento ? Number(form.dia_adiantamento) : null,
        ...(form.tem_adiantamento
          ? {
              adiantamento_antecedencia_dias: Math.min(20, Math.max(1, Math.round(Number(form.adiantamento_antecedencia_dias) || 5))),
              adiantamento_aviso: form.adiantamento_aviso,
            }
          : {}),
        pagamento_salario_tipo: form.pagamento_salario_tipo || null,
        pagamento_salario_dia:
          form.pagamento_salario_tipo === "dia_fixo" && form.pagamento_salario_dia ? Number(form.pagamento_salario_dia) : null,
        banco_horas: form.banco_horas,
        compensa_feriados: form.compensa_feriados,
        convoca_feriados_automatico: form.convoca_feriados_automatico,
        compensacao_feriado_antecedencia_dias: Math.min(60, Math.max(0, Number(form.compensacao_feriado_antecedencia_dias) || 0)),
        ...(compensacaoAtiva && cienciaNova
          ? { compensacao_sindical_ciencia_em: cienciaEm, compensacao_sindical_ciencia_por: (await supabase.auth.getUser()).data.user?.id ?? null }
          : {}),
      } as Parameters<typeof upsert.mutateAsync>[0]);
      if (unidadeId && (pontoAlterado || (!form.possui_relogio_ponto && justificativaAlterada))) {
        const { data: r, error: errPonto } = await supabase.rpc("dp_unidade_definir_ponto" as never, {
          _unidade_id: unidadeId,
          _possui: form.possui_relogio_ponto,
          _justificativa: form.possui_relogio_ponto ? null : justificativaPonto.trim() || null,
        } as never);
        if (errPonto) throw errPonto;
        const alterados = (r as { colaboradores_alterados?: number } | null)?.colaboradores_alterados ?? 0;
        if (pontoAlterado && alterados > 0) {
          toast.info(`Folha de ponto ${form.possui_relogio_ponto ? "ativada" : "desativada"} para ${alterados} colaborador(es) da unidade.`);
        }
        qc.invalidateQueries({ queryKey: ["dp_ponto_conformidade"] });
        qc.invalidateQueries({ queryKey: ["dp_unidades"] });
        qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
        forcarRecargaPendencias(form.company_id);
      }
      await registrarPeriodosPolitica(
        form.company_id,
        salva.id,
        politicasPendentes.map((p) => ({ politica: p.politica, ativo: p.atual, data: datasPolitica[p.politica]! })),
      );
      setDatasPolitica({});
      if (salvarFuncionamento.current) await salvarFuncionamento.current();
      onSaved?.(salva);
      const eraNova = !gravada;
      setGravada((anterior) => ({
        ...(anterior ?? {}),
        id: salva.id,
        company_id: form.company_id,
        nome: form.nome.trim(),
        ativo: form.ativo,
        possui_relogio_ponto: form.possui_relogio_ponto,
        relogio_ponto_dispensa_justificativa: form.possui_relogio_ponto ? null : justificativaPonto.trim() || null,
        banco_horas: form.banco_horas,
        compensa_feriados: form.compensa_feriados,
        tem_adiantamento: form.tem_adiantamento,
        compensacao_sindical_ciencia_em: cienciaEm ?? anterior?.compensacao_sindical_ciencia_em ?? null,
      }));
      if (eraNova) setCriadaId(salva.id);
      const proxima = proximaEtapaUnidade(aba);
      if (modo === "avancar" && proxima) {
        setAba(proxima);
        toast.success(eraNova ? "Unidade criada. Siga para a próxima etapa." : "Etapa salva.");
        return;
      }
      if (!eraNova || modo === "avancar") {
        toast.success(eraNova ? "Unidade criada" : "Unidade atualizada");
        onOpenChange(false);
        return;
      }
      // Nova unidade pelo "Cadastrar": mantém aberta para configurar o funcionamento da loja.
      setAba("funcionamento");
      toast.success("Unidade criada. Agora defina o horário de funcionamento (opcional).");
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-full min-w-0 max-w-full sm:max-w-2xl flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b p-4 pr-12 text-left">
          <DialogTitle className="break-words">
            {unidade ? unidade.nome || "Editar unidade" : "Nova unidade"}
          </DialogTitle>
        </DialogHeader>
        <Tabs
          value={aba}
          onValueChange={(v) => setAba(v as UnidadeAba)}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
        >
          <UnidadeTabsBar value={aba} />
        <TabsContent value="dados" className="mt-0 min-h-0 min-w-0 w-full flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain p-4 [&_input]:min-w-0 [&_input]:max-w-full [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_button[role=combobox]]:min-h-11 [&_button[role=combobox]]:min-w-0 [&_button[role=combobox]>span]:truncate">
          <div className="space-y-2">
            <Label>Empresa vinculada *</Label>
            {companies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                Nenhuma empresa cadastrada.{" "}
                <Link to="/empresas" className="text-primary underline">
                  Cadastre em Minhas Empresas
                </Link>{" "}
                antes de criar unidades.
              </div>
            ) : (
              <Select
                value={form.company_id}
                onValueChange={(v) => setForm((prev) => ({ ...prev, company_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.trade_name || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-muted-foreground">
              A cobrança do plano é por empresa. Uma empresa pode ter várias unidades sem custo extra.
            </p>
            {!unidade && form.company_id && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={loadingBrasilApi}
                onClick={() => void applyCompanyData(form.company_id, true)}
              >
                {loadingBrasilApi ? "Buscando..." : "Usar dados da empresa"}
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <Label>Nome da Unidade *</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Unidade Garavelo"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex flex-wrap items-center gap-2">
              CNPJ
              {loadingBrasilApi && (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Buscando dados na BrasilAPI...
                </span>
              )}
            </Label>
            <Input
              value={formatCNPJ(form.cnpj)}
              onChange={(e) => setForm({ ...form, cnpj: onlyNumbers(e.target.value) })}
              placeholder="00.000.000/0000-00"
              maxLength={18}
            />
          </div>
          <div className="space-y-2">
            <Label>Endereço</Label>
            <EnderecoFields
              idPrefix="unidade"
              valor={{
                cep: form.cep,
                logradouro: form.logradouro,
                numero: form.numero,
                complemento: form.complemento,
                bairro: form.bairro,
                cidade: form.cidade,
                uf: form.uf,
              }}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              placeholder="Ex: (62) 99999-9999"
            />
          </div>
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex min-h-11 items-center gap-3">
              <Switch
                id="possui_relogio_ponto"
                checked={form.possui_relogio_ponto}
                onCheckedChange={(v) => setForm({ ...form, possui_relogio_ponto: v })}
              />
              <Label htmlFor="possui_relogio_ponto">Possui relógio de ponto</Label>
            </div>
            {campoData("relogio_ponto", form.possui_relogio_ponto)}
            {pontoObrigatorio && !form.possui_relogio_ponto && (
              <div className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5">
                <p className="text-[11px] leading-relaxed text-destructive">
                  Atenção: esta unidade tem {ativosUnidade} colaboradores ativos. {AVISO_ART74} Se a unidade não
                  adota o ponto, registre o motivo.
                </p>
                <Label htmlFor="justificativa_ponto_unidade" className="text-xs">Justificativa da Dispensa *</Label>
                <Textarea
                  id="justificativa_ponto_unidade"
                  value={justificativaPonto}
                  onChange={(e) => setJustificativaPonto(e.target.value)}
                  placeholder="Ex.: Implantação do relógio eletrônico em andamento, previsão para dezembro"
                  maxLength={500}
                  rows={2}
                />
              </div>
            )}
            {pontoAlterado && unidadeId && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {form.possui_relogio_ponto
                  ? "Ao salvar, a folha de ponto volta a ser exigida dos colaboradores com carteira assinada desta unidade (exceto dispensas individuais justificadas)."
                  : "Ao salvar, a folha de ponto deixa de ser exigida de todos os colaboradores desta unidade."}
              </p>
            )}
          </div>
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex min-h-11 items-center gap-3">
              <Switch id="banco_horas" checked={form.banco_horas} onCheckedChange={(v) => setForm({ ...form, banco_horas: v })} />
              <Label htmlFor="banco_horas">Adota banco de horas</Label>
            </div>
            {campoData("banco_horas", form.banco_horas)}
            {form.banco_horas && !form.possui_relogio_ponto && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5">
                <p className="text-[11px] leading-relaxed text-destructive">
                  Atenção: a unidade adota banco de horas sem relógio de ponto. O banco de horas depende de controle
                  fiel da jornada (entradas, saídas e intervalos). Sem esse registro, a empresa não consegue comprovar
                  os saldos e, em fiscalização ou ação trabalhista, o banco pode ser invalidado e as horas cobradas como
                  extras (mínimo de 50%). Se o controle é feito fora do sistema (livro, folha manual ou outro sistema),
                  guarde esses registros.
                </p>
              </div>
            )}
            {form.banco_horas && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                <p className="text-[11px] leading-relaxed">
                  Atenção: banco de horas e trabalho/compensação em feriados no comércio e na alimentação dependem de
                  autorização na Convenção ou no Acordo Coletivo com o sindicato (CLT art. 59 e Lei 10.101/2000, art. 6º-A).
                  Sem essa negociação, a empresa pode ser autuada e condenada ao pagamento das horas como extras.
                </p>
                <label className="flex items-start gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.ciencia_sindical}
                    onChange={(e) => setForm({ ...form, ciencia_sindical: e.target.checked })}
                  />
                  Confirmo que a convenção ou acordo coletivo vigente autoriza essas práticas nesta unidade.
                </label>
              </div>
            )}
          </div>
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="space-y-1">
              <Label htmlFor="pagamento_salario_tipo">Pagamento do salário mensal</Label>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Aparece como previsão no calendário dos mensalistas e no calendário do gestor.
              </p>
            </div>
            <Select
              value={form.pagamento_salario_tipo || "nao_informado"}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  pagamento_salario_tipo: v === "nao_informado" ? "" : (v as "quinto_dia_util" | "dia_fixo"),
                  pagamento_salario_dia: v === "dia_fixo" ? form.pagamento_salario_dia : "",
                })
              }
            >
              <SelectTrigger id="pagamento_salario_tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_informado">Não informar</SelectItem>
                <SelectItem value="quinto_dia_util">5º dia útil do mês</SelectItem>
                <SelectItem value="dia_fixo">Dia fixo do mês</SelectItem>
              </SelectContent>
            </Select>
            {form.pagamento_salario_tipo === "quinto_dia_util" && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Conta de segunda a sábado (CLT, art. 459, §1º). Domingos e feriados nacionais, estaduais e municipais
                cadastrados na unidade não contam. Com Pix, o pagamento pode ser feito no próprio sábado.
              </p>
            )}
            {form.pagamento_salario_tipo === "dia_fixo" && (
              <div className="space-y-2">
                <Label htmlFor="pagamento_salario_dia">Dia do Pagamento *</Label>
                <Select
                  value={form.pagamento_salario_dia || ""}
                  onValueChange={(v) => setForm({ ...form, pagamento_salario_dia: v })}
                >
                  <SelectTrigger id="pagamento_salario_dia">
                    <SelectValue placeholder="Selecione o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((dia) => (
                      <SelectItem key={dia} value={dia.toString()}>{dia}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {Number(form.pagamento_salario_dia) > 5 && (
                  <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[11px] leading-relaxed">
                    Atenção: para o salário do mês anterior, a CLT fixa o prazo até o 5º dia útil. Depois do dia 5,
                    a data pode passar desse prazo em alguns meses.
                  </p>
                )}
              </div>
            )}
          </div>
          <div id="unidade-adiantamento" className="scroll-mt-4 space-y-3 rounded-xl border border-border p-3">
            <div className="flex min-h-11 items-center gap-3">
            <Switch
              id="tem_adiantamento"
              checked={form.tem_adiantamento}
              onCheckedChange={(v) =>
                setForm({ ...form, tem_adiantamento: v, dia_adiantamento: v ? form.dia_adiantamento : "" })
              }
            />
            <Label htmlFor="tem_adiantamento">Tem adiantamento salarial</Label>
            </div>
            {campoData("adiantamento", form.tem_adiantamento)}
            {form.tem_adiantamento && (
              <div className="space-y-2">
                <Label>Dia do Adiantamento</Label>
                <Select
                  value={form.dia_adiantamento || ""}
                  onValueChange={(v) => setForm({ ...form, dia_adiantamento: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((dia) => (
                      <SelectItem key={dia} value={dia.toString()}>{dia}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.tem_adiantamento && (
              <div className="space-y-2">
                <Label htmlFor="adiantamento_antecedencia_dias">Antecedência mínima para o pedido (dias)</Label>
                <Input
                  id="adiantamento_antecedencia_dias"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={form.adiantamento_antecedencia_dias}
                  onChange={(e) => setForm({ ...form, adiantamento_antecedencia_dias: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const dia = Number(form.dia_adiantamento);
                    const ant = Number(form.adiantamento_antecedencia_dias) || 5;
                    const prazo = dia && dia - ant >= 1 ? `até o dia ${dia - ant}` : `até ${ant} dias antes do pagamento`;
                    return `O colaborador pede ou suspende pelo portal ${prazo} para valer no mês; depois, vale a partir do mês seguinte. O gestor altera a qualquer momento, sem antecedência.`;
                  })()}
                </p>
              </div>
            )}
            {form.tem_adiantamento && (
              <div className="space-y-2">
                <Label>Avisos para a gestão</Label>
                <Select
                  value={form.adiantamento_aviso}
                  onValueChange={(v) => setForm({ ...form, adiantamento_aviso: v as "alteracoes" | "relacao_mensal" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alteracoes">Só novas adesões e suspensões</SelectItem>
                    <SelectItem value="relacao_mensal">Relação completa todo mês</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.adiantamento_aviso === "relacao_mensal"
                    ? "Além de cada pedido, quando o prazo fecha chega o aviso com todos que recebem no mês, pronto para baixar em PDF."
                    : "Aviso a cada pedido feito pelo portal."}
                </p>
              </div>
            )}
            {/* Só depois de gravado ligado: antes disso não há relação para ver. */}
            {unidadeId && form.tem_adiantamento && gravada?.tem_adiantamento && (
              <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
                <Link to={`/dp/adiantamentos?unidade=${unidadeId}`} onClick={() => onOpenChange(false)}>
                  <HandCoins className="mr-2 h-4 w-4" aria-hidden="true" />
                  Ver relação de adiantamentos desta unidade
                </Link>
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="setores" className="mt-0 min-h-0 min-w-0 w-full flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain p-4 [&_input]:min-w-0 [&_input]:max-w-full [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_button[role=combobox]]:min-h-11 [&_button[role=combobox]]:min-w-0 [&_button[role=combobox]>span]:truncate">
          <UnidadeSetoresPanel unidadeId={unidadeId} unidadeNome={form.nome} />
        </TabsContent>

        <TabsContent value="funcionamento" className="mt-0 min-h-0 min-w-0 w-full flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain p-4 [&_input]:min-w-0 [&_input]:max-w-full [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_button[role=combobox]]:min-h-11 [&_button[role=combobox]]:min-w-0 [&_button[role=combobox]>span]:truncate">
          <Label className="flex items-center gap-1.5">
            <Store className="h-4 w-4" aria-hidden="true" />
            Horário de funcionamento da loja
          </Label>
          <HorarioFuncionamentoEditor unidadeId={unidadeId} semRodape onRegistrarSalvar={registrarSalvar} />
        </TabsContent>

        <TabsContent value="feriados" className="mt-0 min-h-0 min-w-0 w-full flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain p-4 [&_input]:min-w-0 [&_input]:max-w-full [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_button[role=combobox]]:min-h-11 [&_button[role=combobox]]:min-w-0 [&_button[role=combobox]>span]:truncate">
          <section aria-labelledby="regras-feriado-titulo" className="space-y-3 rounded-xl border border-border p-3">
            <h3 id="regras-feriado-titulo" className="text-sm font-semibold">Regras de feriado</h3>
            <div className="space-y-2">
            <div className="flex min-h-11 items-center gap-3">
              <Switch id="convoca_feriados_automatico" checked={form.convoca_feriados_automatico} onCheckedChange={(v) => setForm({ ...form, convoca_feriados_automatico: v })} />
              <Label htmlFor="convoca_feriados_automatico">Convocação automática para feriados (conforme ACT/CCT)</Label>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {form.convoca_feriados_automatico
                ? "Ligado: na geração da escala, quem trabalha normalmente naquele dia da semana fica convocado para todos os feriados e é notificado. Quem tem folga fixa, férias, atestado ou outro afastamento no feriado não é convocado. Incluir depois quem tinha folga fixa no feriado gera pagamento em dobro."
                : "Desligado: ninguém é convocado automaticamente para feriados. A loja recebe alerta para montar a escala de cada feriado manualmente. Escalar quem tem folga fixa no feriado gera pagamento em dobro."}
            </p>
            </div>
            <div className="space-y-2 border-t border-border pt-3">
            <div className="flex min-h-11 items-center gap-3">
              <Switch id="compensa_feriados" checked={form.compensa_feriados} onCheckedChange={(v) => setForm({ ...form, compensa_feriados: v })} />
              <Label htmlFor="compensa_feriados">Compensação de feriados</Label>
            </div>
            {campoData("compensa_feriados", form.compensa_feriados)}
            {form.compensa_feriados && (
              <div className="space-y-1.5">
                <Label htmlFor="comp_antecedencia" className="text-xs">Antecedência mínima para pedir a folga (dias)</Label>
                <Input
                  id="comp_antecedencia"
                  type="number"
                  min={0}
                  max={60}
                  className="w-full sm:w-28"
                  value={form.compensacao_feriado_antecedencia_dias}
                  onChange={(e) => setForm({ ...form, compensacao_feriado_antecedencia_dias: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">Pedidos com prazo menor não são barrados, mas o colaborador é avisado de que podem ser recusados.</p>
              </div>
            )}
            </div>
            {form.compensa_feriados && !form.banco_horas && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                <p className="text-[11px] leading-relaxed">
                  Atenção: banco de horas e trabalho/compensação em feriados no comércio e na alimentação dependem de
                  autorização na Convenção ou no Acordo Coletivo com o sindicato (CLT art. 59 e Lei 10.101/2000, art. 6º-A).
                  Sem essa negociação, a empresa pode ser autuada e condenada ao pagamento das horas como extras.
                </p>
                <label className="flex items-start gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.ciencia_sindical}
                    onChange={(e) => setForm({ ...form, ciencia_sindical: e.target.checked })}
                  />
                  Confirmo que a convenção ou acordo coletivo vigente autoriza essas práticas nesta unidade.
                </label>
              </div>
            )}
          </section>
          <UnidadeFeriadosPanel unidadeId={unidadeId} />
        </TabsContent>


        <TabsContent value="sindicato" className="mt-0 min-h-0 min-w-0 w-full flex-1 space-y-6 overflow-y-auto overflow-x-hidden overscroll-contain p-4 [&_input]:min-w-0 [&_input]:max-w-full [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_button[role=combobox]]:min-h-11 [&_button[role=combobox]]:min-w-0 [&_button[role=combobox]>span]:truncate">
          <UnidadeSindicatoPanel unidadeId={unidadeId} unidadeNome={form.nome} cidade={form.cidade} uf={form.uf} />
          <div className="border-t pt-4">
            <UnidadeNegociacoesPanel unidadeId={unidadeId} unidadeNome={form.nome} />
          </div>
        </TabsContent>

        </Tabs>
        <DialogFooter className="shrink-0 flex-row gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row">
          <Button variant="ghost" className="hidden h-11 sm:inline-flex sm:w-auto" onClick={() => onOpenChange(false)}>
            {criadaId ? "Fechar" : "Cancelar"}
          </Button>
          {proximaEtapaUnidade(aba) ? (
            <>
              <Button variant="outline" className="h-11 flex-1 sm:flex-none sm:w-auto" onClick={() => void save("fechar")} disabled={upsert.isPending}>
                {gravada ? "Salvar" : "Cadastrar"}
              </Button>
              <Button className="h-11 flex-1 sm:flex-none sm:w-auto" onClick={() => void save("avancar")} disabled={upsert.isPending}>
                {upsert.isPending ? "Salvando..." : "Salvar e avançar"}
              </Button>
            </>
          ) : (
            <Button className="h-11 w-full sm:w-auto" onClick={() => void save("fechar")} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : gravada ? "Salvar e concluir" : "Cadastrar"}
            </Button>
          )}
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

/**
 * Revisão da Pré-Admissão pelo gestor na FICHA ÚNICA: é a mesma tela do
 * cadastro manual do colaborador (sindicato, espelho de jornada, piso do
 * cargo, benefícios), aberta em modo "Em Admissão". Nada entra no cadastro
 * oficial antes da efetivação.
 *
 * O gestor corrige o que o candidato preencheu, gera a ficha para a
 * registro oficial e só então conclui a admissão. Toda
 * gravação passa pelo servidor, que revalida campos e permissões.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle, CheckCircle2, Clock, Download, Eye, FileUp, Loader2, Plus, Printer, Store, Trash2, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { notifyError } from "@/lib/notifyError";
import { gerarFichaAdmissaoPdf } from "@/lib/dp/ficha-admissao-pdf";
import { AsoAdmissionalCard } from "./AsoAdmissionalCard";
import { asoLiberaContabilidade, BASES_LEGAIS_DISPENSA, type AsoDados } from "@/lib/dp/aso-admissional";
import { documentoPorVinculo } from "@/lib/dp/vinculo-documento";
import { abrirAsoPreadmissao } from "@/hooks/dp/useDpPreadmissoes";

/** Ordem da conferência guiada do gestor (abas da ficha). */
const ABAS_CONFERENCIA: Array<{ aba: string; rotulo: string }> = [
  { aba: "dados", rotulo: "Identificação" },
  { aba: "jornada", rotulo: "Horário" },
  { aba: "remuneracao", rotulo: "Remuneração" },
  { aba: "dependentes", rotulo: "Dependentes" },
  { aba: "documentos", rotulo: "Documentos" },
];
import { PARENTESCOS_EMERGENCIA, contatosDaFicha, rotuloParentescoEmergencia } from "@/lib/dp/contatosEmergencia";
import { maskPhone } from "@/lib/phone";
import { maskCpf } from "@/lib/cpf";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { TermoContaTerceiroPreviaDialog } from "@/components/dp/TermoContaTerceiroPreviaDialog";
import { PAGAMENTO_BLANK } from "@/lib/dp/dadosPagamento";
import { tipoPelaExtensao } from "@/lib/dp/abrirDocumento";
import { PreadmissaoExcluirDialog } from "@/components/dp/preadmissao/PreadmissaoExcluirDialog";
import {
  ColaboradorFormDialog, type ModoAdmissao, type SalvarAdmissaoEntrada,
} from "@/components/dp/ColaboradorFormDialog";
import type { JornadaRascunho } from "@/components/dp/ColaboradorJornadaPanel";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import { CargoSelectItems, CargoSelectAviso } from "@/components/dp/cargos/CargoSelectItems";
import { useDpSetores } from "@/hooks/useDpSetores";
import {
  PREADMISSAO_STATUS_LABEL, abrirDocumentoPreadmissao, anexarFichaOficial,
  diasAguardandoRegistro, rotinaDaPreadmissao,
  useDpPreadmissao, useDpPreadmissaoGestor, type PreadmissaoStatus,
} from "@/hooks/dp/useDpPreadmissoes";

const REGIMES = [
  { value: "clt", label: "CLT efetivo" },
  { value: "intermitente", label: "CLT intermitente" },
  { value: "estagio", label: "Estagiário" },
  { value: "temporario", label: "Temporário" },
  { value: "pj", label: "PJ / Sócio" },
  { value: "mei", label: "MEI" },
  { value: "freelancer", label: "Freelancer (sem registro)" },
];

/** Formas de pagamento canônicas do DP (mesmos valores do cadastro). */
const FORMAS = [
  { value: "mensalista", label: "Mensalista" },
  { value: "horista", label: "Horista" },
  { value: "diarista", label: "Diarista" },
  { value: "semanal", label: "Semanal" },
  { value: "por_turno", label: "Por turno" },
  { value: "servico_acordo", label: "Por serviço / acordo" },
];

const SEXOS = [
  { value: "feminino", label: "Feminino" },
  { value: "masculino", label: "Masculino" },
  { value: "nao_informado", label: "Prefiro não informar" },
];

const ESTADOS_CIVIS = [
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "uniao_estavel", label: "União estável" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "separado", label: "Separado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
];

const INSTRUCOES = [
  { value: "fundamental_incompleto", label: "Fundamental incompleto" },
  { value: "fundamental_completo", label: "Fundamental completo" },
  { value: "medio_incompleto", label: "Médio incompleto" },
  { value: "medio_completo", label: "Médio completo" },
  { value: "superior_incompleto", label: "Superior incompleto" },
  { value: "superior_completo", label: "Superior completo" },
];

const CONTA_TIPOS = [
  { value: "corrente", label: "Conta corrente" },
  { value: "poupanca", label: "Conta poupança" },
  { value: "pagamento", label: "Conta de pagamento" },
  { value: "salario", label: "Conta salário" },
];

const PIX_TIPOS = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Celular" },
  { value: "aleatoria", label: "Chave aleatória" },
];

const PARENTESCOS = [
  { value: "filho", label: "Filho(a)" },
  { value: "enteado", label: "Enteado(a)" },
  { value: "tutelado", label: "Tutelado(a)" },
  { value: "menor guarda", label: "Menor sob guarda" },
  { value: "conjuge", label: "Cônjuge" },
  { value: "companheiro", label: "Companheiro(a)" },
  { value: "pai", label: "Pai" },
  { value: "mae", label: "Mãe" },
  { value: "avo", label: "Avô" },
  { value: "ava", label: "Avó" },
  { value: "irmao", label: "Irmão(ã)" },
];

/** Campos da ficha do candidato aceitos pelo servidor (mesma allowlist). */
const CAMPOS_FICHA_EDITAVEIS = [
  "nome", "nome_social", "cpf", "email", "data_nascimento", "estado_civil", "sexo",
  "nacionalidade", "naturalidade", "naturalidade_uf",
  "nome_mae", "nome_pai", "grau_instrucao", "raca_cor", "deficiencia",
  "telefone", "whatsapp_contato",
  "emerg1_nome", "emerg1_parentesco", "emerg1_whatsapp", "emerg2_nome", "emerg2_parentesco", "emerg2_whatsapp",
  "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf",
  "rg_numero", "rg_orgao", "rg_uf", "rg_emissao",
  "ctps_numero", "ctps_serie", "ctps_uf", "ctps_expedicao",
  "titulo_eleitor", "titulo_zona", "titulo_secao",
  "reservista", "reservista_categoria", "pis",
  "banco_nome", "agencia", "conta", "conta_digito", "conta_tipo",
  "pix_tipo", "pix_chave",
  "pagamento_terceiro", "titular_nome", "titular_cpf", "titular_relacao",
] as const;

type CampoFicha = (typeof CAMPOS_FICHA_EDITAVEIS)[number];

/** Nomes próprios e endereços ficam em CAIXA ALTA, como no cadastro. */
const CAIXA_ALTA: ReadonlySet<string> = new Set([
  "nome", "nome_social", "nome_mae", "nome_pai", "naturalidade", "naturalidade_uf",
  "endereco", "complemento", "bairro", "cidade", "uf", "banco_nome", "titular_nome", "titular_relacao",
  "rg_orgao", "rg_uf", "ctps_uf", "reservista_categoria", "nacionalidade", "emerg1_nome", "emerg2_nome",
]);

/** Rótulos das informações administrativas, em linguagem de tela. */
const ROTULOS_ADMIN: Array<[string, string]> = [
  ["data_admissao", "Data de admissão"], ["cargo_id", "Cargo"], ["unidade_id", "Unidade"],
  ["setor_id", "Setor"], ["regime_trabalho", "Vínculo"], ["salario", "Salário"],
  ["forma_pagamento", "Forma de pagamento"], ["jornada_descricao", "Jornada prevista"],
  ["carga_horaria_semanal", "Carga horária semanal"], ["experiencia_dias", "Experiência (dias)"],
  ["vale_transporte", "Vale-transporte"], ["adicional_insalubridade", "Adicional de insalubridade"],
  ["adicional_periculosidade", "Adicional de periculosidade"], ["observacoes", "Observações"],
];

/** Campos da ficha na folha imprimível da contabilidade. */
const CAMPOS_IMPRESSAO: Array<[string, string]> = [
  ["nome", "Nome"], ["nome_social", "Nome social"], ["cpf", "CPF"], ["data_nascimento", "Nascimento"],
  ["sexo", "Sexo"], ["estado_civil", "Estado civil"], ["raca_cor", "Raça / cor"], ["deficiencia", "Deficiência"],
  ["nacionalidade", "Nacionalidade"], ["naturalidade", "Cidade de nascimento"], ["naturalidade_uf", "UF de nascimento"],
  ["nome_mae", "Nome da mãe"], ["nome_pai", "Nome do pai"], ["grau_instrucao", "Escolaridade"],
  ["telefone", "WhatsApp"], ["email", "E-mail"],
  ["cep", "CEP"], ["endereco", "Endereço"], ["numero", "Número"], ["complemento", "Complemento"],
  ["bairro", "Bairro"], ["cidade", "Cidade"], ["uf", "UF"],
  ["rg_numero", "RG"], ["rg_orgao", "Órgão emissor"], ["rg_uf", "UF do RG"], ["rg_emissao", "Emissão do RG"],
  ["pis", "PIS / PASEP / NIS"],
  ["ctps_numero", "CTPS"], ["ctps_serie", "Série da CTPS"], ["ctps_uf", "UF da CTPS"], ["ctps_expedicao", "Expedição da CTPS"],
  ["titulo_eleitor", "Título de eleitor"], ["titulo_zona", "Zona"], ["titulo_secao", "Seção"],
  ["reservista", "Reservista"], ["reservista_categoria", "Categoria da reservista"],
  ["banco_nome", "Banco"], ["conta_tipo", "Tipo de conta"], ["agencia", "Agência"], ["conta", "Conta"],
  ["conta_digito", "Dígito"], ["pix_tipo", "Tipo de chave Pix"], ["pix_chave", "Chave Pix"],
  ["pagamento_terceiro", "Conta de outra pessoa"], ["titular_nome", "Titular da conta"],
  ["titular_cpf", "CPF do titular"], ["titular_relacao", "Relação com o titular"],
];

const ROTULOS_OPCOES: Record<string, Record<string, string>> = {
  sexo: Object.fromEntries(SEXOS.map((s) => [s.value, s.label])),
  estado_civil: Object.fromEntries(ESTADOS_CIVIS.map((s) => [s.value, s.label])),
  grau_instrucao: Object.fromEntries(INSTRUCOES.map((s) => [s.value, s.label])),
  conta_tipo: Object.fromEntries(CONTA_TIPOS.map((s) => [s.value, s.label])),
  pix_tipo: Object.fromEntries(PIX_TIPOS.map((s) => [s.value, s.label])),
  pagamento_terceiro: { sim: "Sim, pedida pelo candidato", nao: "Não" },
  emerg1_parentesco: Object.fromEntries(PARENTESCOS_EMERGENCIA.map((s) => [s.value, s.label])),
  emerg2_parentesco: Object.fromEntries(PARENTESCOS_EMERGENCIA.map((s) => [s.value, s.label])),
};

const ROTULO_DIVERGENCIA_OCR: Record<string, string> = { nome: "Nome", cpf: "CPF", data_nascimento: "Data de nascimento" };
const formatarDivergencia = (campo: string, v: string) =>
  campo === "cpf" ? maskCpf(v) : campo === "data_nascimento" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v;

const valorFicha = (campo: string, valor: unknown): string => {
  if (valor === null || valor === undefined || String(valor).trim() === "") return "";
  const bruto = String(valor);
  return ROTULOS_OPCOES[campo]?.[bruto] ?? bruto;
};

const mascaraCpf = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");

interface PessoaEditavel {
  id: string | null;
  nome: string;
  parentesco: string;
  data_nascimento: string;
  cpf: string;
  rg: string;
  finalidade_dependente: boolean;
  finalidade_sesc: boolean;
  finalidades: string[];
}

/** Finalidade que vem da lei e existe em toda empresa. */
const FINALIDADE_LEGAL = "dependente_legal";
const FINALIDADE_LEGAL_NOME = "Dependente Legal (Imposto de Renda)";

/** Mantém as marcações antigas em linha com a lista de finalidades. */
function comFinalidades(p: PessoaEditavel, lista: string[]): PessoaEditavel {
  const limpa = Array.from(new Set(lista));
  return {
    ...p,
    finalidades: limpa,
    finalidade_dependente: limpa.includes(FINALIDADE_LEGAL),
    finalidade_sesc: limpa.includes("sesc"),
  };
}


interface Props {
  preadmissaoId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function PreadmissaoRevisaoDialog({ preadmissaoId, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useDpPreadmissao(preadmissaoId);
  const acoes = useDpPreadmissaoGestor(preadmissaoId);
  const [aba, setAba] = useState("dados");
  /** Abas já abertas pelo gestor nesta conferência. */
  const [vistas, setVistas] = useState<Set<string>>(new Set(["dados"]));
  const [abaConf, setAbaConf] = useState("dados");
  const [abaPedida, setAbaPedida] = useState<{ aba: string; n: number } | null>(null);
  useEffect(() => { setVistas(new Set(["dados"])); setAbaConf("dados"); setAbaPedida(null); }, [preadmissaoId]);
  const marcarAba = (a: string) => { setAbaConf(a); setVistas((v) => (v.has(a) ? v : new Set([...v, a]))); };
  const [motivo, setMotivo] = useState("");
  const [admin, setAdmin] = useState<Record<string, string>>({});
  const [ficha, setFicha] = useState<Record<string, string>>({});
  /** Marca de quando a ficha do candidato terminou de carregar (recarrega o formulário). */
  const [fichaDe, setFichaDe] = useState<string | null>(null);
  const [pessoas, setPessoas] = useState<PessoaEditavel[]>([]);
  const {
    data: cargos = [],
    isLoading: carregandoCargos,
    isError: erroCargos,
    refetch: recarregarCargos,
  } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const { ativos: setores } = useDpSetores(admin.unidade_id || null);
  const fichaRef = useRef<HTMLInputElement>(null);
  const [enviandoFicha, setEnviandoFicha] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const { companies } = useCompanyContext();
  /** Conta de terceiro aprovada: o termo abre logo após a efetivação. */
  const [termoTerceiroDe, setTermoTerceiroDe] = useState<string | null>(null);

  const pa = data?.preadmissao;
  const parentescosPermitidos = data?.parentescos_permitidos ?? null;
  /** Finalidades liberadas num grau, com as marcações antigas como reserva. */
  const liberadasDoGrau = (grau: string): string[] => {
    const regra = parentescosPermitidos?.find((o) => o.parentesco === grau);
    if (!regra) return [];
    const lista = (regra as { finalidades?: string[] }).finalidades ?? [];
    if (lista.length) return lista;
    return [
      ...(regra.permite_dependente ? [FINALIDADE_LEGAL] : []),
      ...(regra.permite_sesc ? ["sesc"] : []),
    ];
  };
  const catalogoFinalidades = [
    { codigo: FINALIDADE_LEGAL, nome: FINALIDADE_LEGAL_NOME },
    ...((data as { finalidades_empresa?: Array<{ codigo: string; nome: string }> } | undefined)?.finalidades_empresa ?? [])
      .filter((f) => f.codigo !== FINALIDADE_LEGAL),
  ];
  const nomeFinalidade = (codigo: string) =>
    catalogoFinalidades.find((f) => f.codigo === codigo)?.nome ?? codigo.replace(/_/g, " ");
  const finalidadesDoFamiliar = (grau: string) => {
    if (!parentescosPermitidos) return catalogoFinalidades;
    const liberadas = liberadasDoGrau(grau);
    return catalogoFinalidades.filter((f) => liberadas.includes(f.codigo));
  };
  const parentescosDaEmpresa = parentescosPermitidos
    ? parentescosPermitidos.filter((p) => liberadasDoGrau(p.parentesco).length).map((p) => ({
        value: p.parentesco,
        label: PARENTESCOS.find((o) => o.value === p.parentesco)?.label ?? p.parentesco.replace(/_/g, " "),
      }))
    : PARENTESCOS;
  const opcoesParentesco = (valor: string) => valor && !parentescosDaEmpresa.some((p) => p.value === valor)
    ? [...parentescosDaEmpresa, { value: valor, label: `${PARENTESCOS.find((p) => p.value === valor)?.label ?? valor} (revisar com a empresa)` }]
    : parentescosDaEmpresa;
  const status = (pa?.status ?? "aguardando_preenchimento") as PreadmissaoStatus;
  const dados = (pa?.dados ?? {}) as Record<string, unknown>;
  /** Ficha encerrada: nada mais pode ser alterado pelo gestor. */
  const encerrada = ["concluido", "cancelado", "expirado"].includes(status);

  useEffect(() => {
    const a = (pa?.admin_dados ?? {}) as Record<string, unknown>;
    const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
    const bool = (v: unknown) => (v === true ? "sim" : v === false ? "nao" : "");
    setAdmin({
      data_admissao: txt(a.data_admissao),
      regime_trabalho: txt(a.regime_trabalho) || (pa?.regime_previsto ?? ""),
      salario: txt(a.salario),
      forma_pagamento: txt(a.forma_pagamento),
      jornada_descricao: txt(a.jornada_descricao),
      carga_horaria_semanal: txt(a.carga_horaria_semanal),
      experiencia_dias: txt(a.experiencia_dias),
      cargo_id: txt(a.cargo_id) || (pa?.cargo_previsto_id ?? ""),
      unidade_id: txt(a.unidade_id) || (pa?.unidade_prevista_id ?? ""),
      setor_id: txt(a.setor_id),
      vale_transporte: bool(a.vale_transporte),
      adicional_insalubridade: bool(a.adicional_insalubridade),
      adicional_periculosidade: bool(a.adicional_periculosidade),
      observacoes: txt(a.observacoes),
    });
  }, [pa?.id, pa?.admin_dados, pa?.cargo_previsto_id, pa?.unidade_prevista_id, pa?.regime_previsto]);

  /** Preenche os campos da ficha com o que o candidato enviou. */
  useEffect(() => {
    const d = (pa?.dados ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const campo of CAMPOS_FICHA_EDITAVEIS) {
      const v = d[campo];
      out[campo] = v === null || v === undefined ? "" : String(v);
    }
    if (!out.nome) out.nome = pa?.candidato_nome ?? "";
    if (!out.cpf && pa?.cpf) out.cpf = mascaraCpf(String(pa.cpf));
    // O WhatsApp do candidato é o contato oficial da ficha (campo WhatsApp).
    if (!out.telefone) {
      const p = (pa ?? {}) as Record<string, unknown>;
      const extra = d as Record<string, unknown>;
      out.telefone = String(extra.whatsapp ?? p.whatsapp ?? p.telefone ?? "").trim();
    }
    // Contatos de emergência: fichas antigas trazem só o "recado".
    if (!out.emerg1_nome && !out.emerg1_whatsapp) {
      contatosDaFicha(d).forEach((c, i) => {
        out[`emerg${i + 1}_nome`] = c.nome;
        out[`emerg${i + 1}_parentesco`] = c.parentesco;
        out[`emerg${i + 1}_whatsapp`] = c.whatsapp;
      });
    }
    setFicha(out);
    setFichaDe(pa?.id ? `${pa.id}:${JSON.stringify(pa?.dados ?? {}).length}` : null);
  }, [pa?.id, pa?.dados, pa?.candidato_nome, pa?.cpf]);

  useEffect(() => {
    setPessoas(
      (data?.pessoas ?? []).map((p) => {
        const salvas = Array.isArray((p as { finalidades?: string[] }).finalidades)
          ? ((p as { finalidades?: string[] }).finalidades ?? []).map(String)
          : [];
        const derivadas = salvas.length ? salvas : [
          ...(p.finalidade_dependente ? [FINALIDADE_LEGAL] : []),
          ...(p.finalidade_sesc ? ["sesc"] : []),
        ];
        return {
          id: p.id,
          nome: p.nome ?? "",
          parentesco: (p.parentesco ?? "").toLowerCase(),
          data_nascimento: p.data_nascimento ?? "",
          cpf: p.cpf ? mascaraCpf(p.cpf) : "",
          rg: p.rg ?? "",
          finalidade_dependente: derivadas.includes(FINALIDADE_LEGAL),
          finalidade_sesc: derivadas.includes("sesc"),
          finalidades: derivadas,
        };
      }),
    );
  }, [data?.pessoas]);

  const mudarFicha = (campo: CampoFicha, valor: string) =>
    setFicha((f) => ({ ...f, [campo]: CAIXA_ALTA.has(campo) ? valor.toUpperCase() : valor }));

  /** Converte a tela em payload aceito pelo servidor (números e Sim/Não). */
  const adminParaEnvio = () => {
    const out: Record<string, unknown> = {};
    const trio = ["vale_transporte", "adicional_insalubridade", "adicional_periculosidade"];
    for (const [k, v] of Object.entries(admin)) {
      if (trio.includes(k)) {
        if (v === "sim") out[k] = true;
        else if (v === "nao") out[k] = false;
        continue;
      }
      out[k] = v;
    }
    return out;
  };

  /** Salva, na mesma ação, as correções da ficha e as informações da empresa. */
  const salvarTudo = async () => {
    if (encerrada) return;
    setSalvando(true);
    try {
      await acoes.salvarFicha.mutateAsync({
        dados: Object.fromEntries(CAMPOS_FICHA_EDITAVEIS.map((c) => [c, ficha[c] ?? ""])),
        pessoas: pessoas
          .filter((p) => p.nome.trim())
          .map((p) => ({
            ...(p.id ? { id: p.id } : {}),
            nome: p.nome.trim(),
            parentesco: p.parentesco,
            data_nascimento: p.data_nascimento || "",
            cpf: p.cpf.replace(/\D/g, ""),
            rg: p.rg.trim(),
            finalidade_dependente: p.finalidade_dependente,
            finalidade_sesc: p.finalidade_sesc,
            finalidades: p.finalidades,
          })),
      });
      await acoes.salvarAdmin.mutateAsync(adminParaEnvio());
      toast.success("Ficha salva.");
      refetch();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "salvar a ficha" });
    } finally {
      setSalvando(false);
    }
  };

  const fichaOficial = useMemo(
    () =>
      (data?.documentos ?? []).find((d) => d.requisito_codigo === "ficha_oficial" && !d.substituido_em) ?? null,
    [data?.documentos],
  );

  const PARENTESCO_LABEL: Record<string, string> = Object.fromEntries(
    PARENTESCOS.map((p) => [p.value, p.label]),
  );
  const STATUS_DOC_LABEL: Record<string, string> = {
    pendente: "Aguardando conferência", aprovado: "Aprovado", recusado: "Recusado",
  };

  /**
   * PDF único com tudo que a contabilidade precisa conferir (dados em nomes de
   * tela, sem códigos internos) e os documentos anexados em seguida. Não há
   * envio automático: o gestor baixa e encaminha. Na primeira geração a
   * pré-admissão avança para a etapa Contabilidade.
   */
  const queryClient = useQueryClient();

  /** Última leitura da identidade: diferenças entre documento e cadastro. */
  const [divergenciasOcr, setDivergenciasOcr] = useState<Array<{ campo: string; cadastro: string; documento: string }>>([]);
  useEffect(() => {
    setDivergenciasOcr([]);
    if (!preadmissaoId) return;
    let vivo = true;
    void supabase
      .from("dp_preadmissao_eventos")
      .select("detalhe")
      .eq("preadmissao_id", preadmissaoId)
      .eq("evento", "ocr_divergencia")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: ev }) => {
        const lista = ((ev?.detalhe as { divergencias?: unknown } | null)?.divergencias ?? []) as Array<{ campo: string; cadastro: string; documento: string }>;
        if (vivo) setDivergenciasOcr(Array.isArray(lista) ? lista : []);
      });
    return () => { vivo = false; };
  }, [preadmissaoId]);
  const [efetivando, setEfetivando] = useState(false);
  const [confirmarClt, setConfirmarClt] = useState(false);
  /** Ativação operacional na rotina da loja (antes do registro formal). */
  const [ativarRotinaAberto, setAtivarRotinaAberto] = useState(false);
  const [dataInicioRotina, setDataInicioRotina] = useState(() => new Date().toISOString().slice(0, 10));
  const [ativandoRotina, setAtivandoRotina] = useState(false);
  const regimeAtual = admin.regime_trabalho || data?.preadmissao?.regime_previsto || "clt";
  const isClt = regimeAtual === "clt" || regimeAtual === "intermitente";
  const statusAtual = data?.preadmissao?.status as string | undefined;
  const podeEfetivar = ["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"]
    .includes(statusAtual ?? "");
  const efetivarDireto = async (confirmado: boolean) => {
    const id = data?.preadmissao?.id;
    if (!id) return;
    setEfetivando(true);
    try {
      const { data: res, error } = await supabase.rpc("dp_preadmissao_efetivar_direto", {
        p_preadmissao_id: id,
        p_data_admissao: admin.data_admissao || undefined,
        p_confirmo_sem_ficha: confirmado,
      });
      if (error) throw error;
      toast.success("Colaborador efetivado com os dados, documentos e dependentes da pré-admissão.");
      const novoId = (res as { colaborador_id?: string } | null)?.colaborador_id;
      if (novoId && ficha.pagamento_terceiro === "sim" && ficha.titular_nome) setTermoTerceiroDe(novoId);
      await queryClient.invalidateQueries();
      await refetch();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "efetivar o colaborador" });
    } finally {
      setEfetivando(false);
      setConfirmarClt(false);
    }
  };
  const pedirEfetivacao = () => {
    if (isClt && !data?.preadmissao?.ficha_oficial_conferida_em) setConfirmarClt(true);
    else void efetivarDireto(false);
  };
  const [gerando, setGerando] = useState(false);
  const gerarFicha = async () => {
    if (!data) return;
    setGerando(true);
    try {
    const admDados = { ...((data.preadmissao.admin_dados ?? {}) as Record<string, unknown>), ...(admin as Record<string, unknown>) };
    const valorAdmin = (campo: string): string => {
      const v = admDados[campo];
      if (campo === "cargo_id") return cargos.find((c) => c.id === v)?.nome ?? "";
      if (campo === "unidade_id") return unidades.find((u) => u.id === v)?.nome ?? "";
      if (campo === "setor_id") return setores.find((s) => s.id === v)?.nome ?? "";
      if (campo === "regime_trabalho") return REGIMES.find((r) => r.value === v)?.label ?? String(v ?? "");
      if (campo === "forma_pagamento") return FORMAS.find((f) => f.value === v)?.label ?? String(v ?? "");
      if (v === true) return "Sim";
      if (v === false) return "Não";
      return v === null || v === undefined ? "" : String(v);
    };
    const linhaAdmin = ROTULOS_ADMIN
      .map(([campo, rotulo]) => [rotulo, valorAdmin(campo)] as [string, string])
      .filter(([, v]) => v.trim() !== "");
    const linhaPessoal = CAMPOS_IMPRESSAO
      .map(([campo, rotulo]) => [rotulo, valorFicha(campo, ficha[campo] ?? dados[campo])] as [string, string])
      .filter(([, v]) => v.trim() !== "");
    const linhaEmergencia = contatosDaFicha(ficha as Record<string, unknown>).map((c, i) =>
      [`Contato ${i + 1}`, [c.nome, rotuloParentescoEmergencia(c.parentesco), c.whatsapp && maskPhone(c.whatsapp)].filter(Boolean).join(" - ")] as [string, string]);
    const vaga = [
      cargos.find((c) => c.id === (admDados.cargo_id ?? data.preadmissao.cargo_previsto_id))?.nome,
      unidades.find((u) => u.id === (admDados.unidade_id ?? data.preadmissao.unidade_prevista_id))?.nome,
    ].filter(Boolean).join(" - ");
    const listaPessoas = (data.pessoas ?? []).map((pe) => {
      const salvas = Array.isArray((pe as { finalidades?: string[] }).finalidades)
        ? ((pe as { finalidades?: string[] }).finalidades ?? [])
        : [];
      const finalidades = (salvas.length ? salvas : [
        ...(pe.finalidade_dependente ? [FINALIDADE_LEGAL] : []),
        ...(pe.finalidade_sesc ? ["sesc"] : []),
      ]).map(nomeFinalidade).join(" e ");
      const partes = [
        PARENTESCO_LABEL[(pe.parentesco ?? "").toLowerCase()] ?? pe.parentesco?.replace(/_/g, " ") ?? "",
        pe.data_nascimento ? `Nascimento: ${pe.data_nascimento}` : null,
        pe.cpf ? `CPF: ${pe.cpf}` : null,
        pe.rg ? `RG: ${pe.rg}` : null,
        finalidades ? `Finalidade: ${finalidades}` : null,
      ].filter(Boolean).join(" - ");
      return [pe.nome ?? "", partes] as [string, string];
    });
    const tituloDoc = (codigo: string) =>
      (data.checklist ?? []).find((c) => c.codigo === codigo)?.titulo ?? codigo.replace(/_/g, " ");
    const docsValidos = vigentes.filter((d) => d.status !== "recusado");
    const linhasDocs = vigentes.map((d) => {
      const titular = d.pessoa_id
        ? (data.pessoas ?? []).find((p) => p.id === d.pessoa_id)?.nome ?? "Familiar"
        : data.preadmissao.candidato_nome;
      const st = STATUS_DOC_LABEL[d.status] ?? d.status;
      const recusa = d.status === "recusado" && d.motivo_recusa ? ` - Motivo: ${d.motivo_recusa}` : "";
      return [`${tituloDoc(d.requisito_codigo)} (${rotuloParte(d)})`, `Titular: ${titular} - ${st}${recusa}`] as [string, string];
    });

    const anexos = [];
    for (const d of docsValidos) {
      const url = await abrirDocumentoPreadmissao(d.id);
      const r = await fetch(url);
      if (!r.ok) throw new Error("Não foi possível baixar um dos documentos anexados.");
      const blob = await r.blob();
      const mimeBruto = (d as { mime_type?: string | null }).mime_type ?? blob.type;
      const mime = mimeBruto && mimeBruto !== "application/octet-stream" ? mimeBruto : tipoPelaExtensao(d.file_name);
      anexos.push({
        titulo: `${tituloDoc(d.requisito_codigo)} - ${rotuloParte(d)} - ${nomePessoa(d.pessoa_id)}`,
        blob,
        mime,
      });
    }

    const aso = (admDados.aso ?? null) as AsoDados | null;
    const dataBr = (v?: string) => (v ? v.split("-").reverse().join("/") : "");
    const linhasAso: Array<[string, string]> = !aso?.modo ? [["Situação", "Exame admissional ainda não registrado"]]
      : aso.modo === "dispensado" ? [
          ["Situação", "Dispensado"],
          ["Base legal", BASES_LEGAIS_DISPENSA.find((b) => b.value === aso.base_legal)?.label ?? String(aso.base_legal ?? "")],
          ["Justificativa", String(aso.justificativa ?? "")],
          ["Registrada em", aso.dispensado_em ? new Date(aso.dispensado_em).toLocaleString("pt-BR") : ""],
        ]
      : aso.modo === "realizado" ? [
          ["Situação", aso.parecer === "apto" ? "Realizado - APTO" : "Realizado - INAPTO"],
          ["Data do exame", dataBr(aso.data_realizacao)],
          ["Médico", [aso.medico, aso.crm && `CRM ${aso.crm}`].filter(Boolean).join(" - ")],
          ["Arquivo", aso.arquivo_path ? "Anexado ao final deste dossiê" : "Ainda não anexado"],
        ]
      : [
          ["Situação", "Agendado"],
          ["Data", `${dataBr(aso.data)}${aso.hora ? ` às ${aso.hora}` : ""}`],
          ["Clínica", [aso.clinica, aso.endereco].filter(Boolean).join(" - ")],
        ];
    if (aso?.modo === "realizado" && aso.arquivo_path) {
      try {
        const r = await abrirAsoPreadmissao(data.preadmissao.id);
        const resp = await fetch(r.url);
        if (resp.ok) {
          const blob = await resp.blob();
          anexos.push({ titulo: "ASO - Atestado de Saúde Ocupacional", blob, mime: r.mime_type ?? blob.type });
        }
      } catch { /* aparece como "não incluído" abaixo */ }
    }
    const fotoDoc = vigentes.find((d) => d.requisito_codigo === "foto_3x4" && !d.pessoa_id && d.status !== "recusado");
    const fotoIdx = fotoDoc ? docsValidos.findIndex((d) => d.id === fotoDoc.id) : -1;
    const foto = fotoIdx >= 0 ? anexos[fotoIdx] : null;
    const oficial = ["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido", "concluido"]
      .includes(status) && (!isClt || asoLiberaContabilidade(aso));
    const empresa = companies.find((c) => c.id === data.preadmissao.company_id) as { name?: string; cnpj?: string | null } | undefined;
    const protocolo = `PA-${new Date(data.preadmissao.created_at ?? Date.now()).getFullYear()}-${data.preadmissao.id.replace(/-/g, "").slice(0, 5).toUpperCase()}`;

    // Cada vínculo gera o documento com a natureza jurídica correta: um
    // prestador PJ nunca recebe um PDF intitulado "Ficha de Admissão".
    const docVinculo = documentoPorVinculo(regimeAtual);
    const { bytes, falhas } = await gerarFichaAdmissaoPdf({
      titulo: ficha.nome || data.preadmissao.candidato_nome,
      subtitulo: vaga ? `Vaga: ${vaga}` : undefined,
      empresa: empresa?.name ?? "",
      cnpj: empresa?.cnpj ?? "",
      protocolo,
      documento: docVinculo.titulo,
      previa: !oficial,
      foto: foto ? { blob: foto.blob, mime: foto.mime } : null,
      secoes: [
        { titulo: "Dados do Candidato", linhas: linhaPessoal },
        { titulo: "Contatos de Emergência", linhas: linhaEmergencia },
        { titulo: "Informações Administrativas", linhas: linhaAdmin },
        { titulo: "Dependentes e Familiares", linhas: listaPessoas },
        // ASO (NR-7 / art. 168 CLT) só existe para vínculo de emprego.
        ...(docVinculo.aso ? [{ titulo: "Saúde Ocupacional (ASO)", linhas: linhasAso }] : []),
        { titulo: "Documentos Anexados", linhas: linhasDocs },
      ],
      anexos,
    });
    const nomeArq = data.preadmissao.candidato_nome
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").toLowerCase();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    link.download = `${oficial ? docVinculo.slug : `previa-${docVinculo.slug}`}-${nomeArq}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 60_000);

    if (falhas.length) toast.warning(`Ficha gerada, mas não foi possível incluir: ${falhas.join(", ")}. Baixe esses documentos separadamente.`);
    else toast.success(oficial ? "Ficha de admissão baixada com os documentos anexados." : "Prévia baixada. A versão oficial sai após a aprovação e o exame admissional.");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "gerar a ficha de admissão" });
    } finally {
      setGerando(false);
    }
  };

  const vigentes = useMemo(() => (data?.documentos ?? []).filter((d) => !d.substituido_em), [data?.documentos]);
  /** Rótulo da foto enviada: frente, verso ou fotos extras do mesmo documento. */
  const rotuloParte = (d: { parte?: number | null; parte_rotulo?: string | null }) => {
    const rotulo = (d.parte_rotulo ?? "").trim();
    if (rotulo) return rotulo;
    const parte = Number(d.parte ?? 1);
    if (parte <= 1) return "Frente";
    if (parte === 2) return "Verso";
    return `Foto ${parte}`;
  };
  const nomePessoa = (id: string | null) =>
    id ? (data?.pessoas ?? []).find((p) => p.id === id)?.nome ?? "Familiar" : "O candidato";

  const ver = async (documentoId: string) => {
    try {
      const url = await abrirDocumentoPreadmissao(documentoId);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "abrir o documento" });
    }
  };

  /**
   * Baixa os documentos vigentes com nomes organizados
   * (candidato-documento-titular). Nada é enviado para fora do sistema.
   */
  const [baixando, setBaixando] = useState(false);
  const baixarDocumentos = async () => {
    if (!data || !vigentes.length) return;
    setBaixando(true);
    const limpar = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "-").toLowerCase();
    try {
      for (const d of vigentes) {
        const url = await abrirDocumentoPreadmissao(d.id);
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error("Não foi possível baixar o arquivo.");
        const blob = await resposta.blob();
        const extensao = d.file_name.includes(".") ? d.file_name.split(".").pop() : "bin";
        const nome = limpar(
          `${data.preadmissao.candidato_nome}-${d.requisito_codigo}-${nomePessoa(d.pessoa_id)}`,
        );
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${nome}.${extensao}`;
        link.click();
        URL.revokeObjectURL(link.href);
      }
      toast.success("Documentos baixados.");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "baixar os documentos" });
    } finally {
      setBaixando(false);
    }
  };

  const executar = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      refetch();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "concluir a ação" });
    }
  };

  const enviarFichaOficial = async (arquivo: File) => {
    setEnviandoFicha(true);
    try {
      await anexarFichaOficial(preadmissaoId!, arquivo);
      toast.success("Ficha oficial anexada. Confira o arquivo e registre a conferência.");
      refetch();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "anexar a ficha oficial" });
    } finally {
      setEnviandoFicha(false);
    }
  };

  /** Campo de texto da ficha, no mesmo formato do cadastro do colaborador. */
  const campoTexto = (
    campo: CampoFicha,
    rotulo: string,
    extra?: { placeholder?: string; tipo?: string; dica?: string },
  ) => (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={`pa-f-${campo}`}>{rotulo}</Label>
      <Input
        id={`pa-f-${campo}`}
        className="h-10"
        type={extra?.tipo ?? "text"}
        placeholder={extra?.placeholder}
        value={ficha[campo] ?? ""}
        disabled={encerrada}
        onChange={(e) => mudarFicha(campo, campo === "cpf" ? mascaraCpf(e.target.value) : e.target.value)}
      />
      {extra?.dica && <p className="text-xs text-muted-foreground">{extra.dica}</p>}
    </div>
  );

  const campoLista = (
    campo: CampoFicha,
    rotulo: string,
    opcoes: Array<{ value: string; label: string }>,
  ) => (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={`pa-f-${campo}`}>{rotulo}</Label>
      <Select value={ficha[campo] ?? ""} disabled={encerrada}
        onValueChange={(v) => setFicha((f) => ({ ...f, [campo]: v }))}>
        <SelectTrigger id={`pa-f-${campo}`} className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const simNao = (campo: string, rotulo: string) => (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={`pa-adm-${campo}`}>{rotulo}</Label>
      <Select value={admin[campo] ?? ""} disabled={encerrada}
        onValueChange={(v) => setAdmin({ ...admin, [campo]: v })}>
        <SelectTrigger id={`pa-adm-${campo}`} className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="nao">Não</SelectItem>
          <SelectItem value="sim">Sim</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  /* ── Ficha única: a mesma tela do cadastro do colaborador ─────────────── */
  const { data: colaboradores = [] } = useDpColaboradores();
  const colaboradorEfetivado = useMemo(
    () => (pa?.colaborador_id ? colaboradores.find((c) => c.id === pa.colaborador_id) ?? null : null),
    [colaboradores, pa?.colaborador_id],
  );
  const adminBruto = (pa?.admin_dados ?? {}) as Record<string, unknown>;
  const jornadaAdmissao = (adminBruto.jornada ?? null) as JornadaRascunho | null;
  /** Jornada consolidada dos dias (horário derivado) usada na ativação. */
  const jornadaAtivacao = jornadaConsolidadaOuNull(jornadaAdmissao);
  /** Ativação operacional já feita (freelancer provisório na rotina da loja). */
  const rotinaInfo = rotinaDaPreadmissao(adminBruto);
  const podeAtivarRotina =
    !encerrada && !rotinaInfo && (regimeAtual === "clt" || regimeAtual === "intermitente");

  /**
   * Jornada enviada na ativação: a da ficha, completando os dias trabalhados
   * com o horário base quando o dia não tem horário próprio.
   */
  const jornadaParaRotina = (j: JornadaRascunho) => ({
    horario: j.horario,
    folga_variavel: j.folga_variavel === true,
    dias: (j.dias ?? []).map((d) => ({
      dow: d.dow,
      trabalha: d.trabalha === true,
      turno_id: d.turno_id ?? null,
      entrada: d.trabalha ? (d.entrada || j.horario?.entrada || null) : null,
      saida: d.trabalha ? (d.saida || j.horario?.saida || null) : null,
      intervalo_minutos: d.trabalha ? (d.intervalo_minutos ?? j.horario?.intervalo_minutos ?? 0) : null,
      setor_id: d.setor_id ?? null,
    })),
  });

  const ativarRotina = async () => {
    const id = pa?.id;
    if (!id || !jornadaAtivacao) return;
    setAtivandoRotina(true);
    try {
      const { error } = await supabase.rpc("dp_preadmissao_ativar_rotina", {
        p_preadmissao_id: id,
        p_data_inicio: dataInicioRotina,
        p_jornada: JSON.parse(JSON.stringify(jornadaParaRotina(jornadaAtivacao))),
      });
      if (error) throw error;
      toast.success(
        regimeAtual === "intermitente"
          ? "Ativado na rotina como freelancer diarista, aguardando o registro."
          : "Ativado na rotina como freelancer mensalista, aguardando o registro.",
      );
      setAtivarRotinaAberto(false);
      await queryClient.invalidateQueries();
      await refetch();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "ativar na rotina da loja" });
    } finally {
      setAtivandoRotina(false);
    }
  };

  const modo = useMemo<ModoAdmissao["form"] | null>(() => {
    if (!pa) return null;
    const f = ficha;
    const sexo = f.sexo === "feminino" ? "F" : f.sexo === "masculino" ? "M" : "none";
    return {
      nome: f.nome ?? "",
      nome_social: f.nome_social ?? "",
      cpf: f.cpf ?? "",
      email: f.email ?? "",
      whatsapp: f.telefone ?? "",
      data_nascimento: f.data_nascimento ?? "",
      sexo,
      rg_numero: f.rg_numero ?? "", rg_orgao: f.rg_orgao ?? "", rg_uf: f.rg_uf ?? "", rg_emissao: f.rg_emissao ?? "",
      ctps_numero: f.ctps_numero ?? "", ctps_serie: f.ctps_serie ?? "", ctps_uf: f.ctps_uf ?? "",
      ctps_expedicao: f.ctps_expedicao ?? "",
      titulo_eleitor: f.titulo_eleitor ?? "", titulo_zona: f.titulo_zona ?? "", titulo_secao: f.titulo_secao ?? "",
      reservista: f.reservista ?? "", reservista_categoria: f.reservista_categoria ?? "",
      nome_pai: f.nome_pai ?? "", nome_mae: f.nome_mae ?? "",
      nacionalidade: f.nacionalidade ?? "", naturalidade: f.naturalidade ?? "",
      raca_cor: f.raca_cor ?? "", deficiencia: f.deficiencia ?? "",
      grau_instrucao: valorFicha("grau_instrucao", f.grau_instrucao),
      cargo_id: admin.cargo_id ?? "",
      unidade_id: admin.unidade_id ?? "",
      setor_id: admin.setor_id ?? "",
      data_admissao: admin.data_admissao || new Date().toISOString().slice(0, 10),
      tipo_vinculo: REGIME_PARA_VINCULO[admin.regime_trabalho] ?? "CLT",
    };
  }, [pa, ficha, admin]);

  /** Grava a ficha única: dados pessoais + dependentes, depois dados da empresa. */
  const salvarUnificado = async (e: SalvarAdmissaoEntrada) => {
    if (encerrada) return;
    setSalvando(true);
    try {
      const f = e.form as Record<string, string>;
      const g = String(f.grau_instrucao ?? "").trim();
      const grau = INSTRUCOES.find((o) => o.label === g || o.value === g)?.value ?? ficha.grau_instrucao ?? "";
      const dadosFicha: Record<string, string> = {
        ...Object.fromEntries(CAMPOS_FICHA_EDITAVEIS.map((c) => [c, ficha[c] ?? ""])),
        nome: String(f.nome ?? "").toUpperCase(),
        nome_social: String(f.nome_social ?? "").toUpperCase(),
        cpf: String(f.cpf ?? ""),
        email: String(f.email ?? ""),
        telefone: String(f.whatsapp ?? ""),
        data_nascimento: String(f.data_nascimento ?? ""),
        sexo: f.sexo === "F" ? "feminino" : f.sexo === "M" ? "masculino" : (ficha.sexo ?? ""),
        grau_instrucao: grau,
        cep: e.endereco.cep ?? "", endereco: (e.endereco.logradouro ?? "").toUpperCase(),
        numero: e.endereco.numero ?? "", complemento: (e.endereco.complemento ?? "").toUpperCase(),
        bairro: (e.endereco.bairro ?? "").toUpperCase(), cidade: (e.endereco.cidade ?? "").toUpperCase(),
        uf: (e.endereco.uf ?? "").toUpperCase(),
        banco_nome: e.pagamento.banco_nome ?? "", agencia: e.pagamento.agencia ?? "",
        conta: e.pagamento.conta ?? "", conta_digito: e.pagamento.conta_digito ?? "",
        conta_tipo: e.pagamento.conta_tipo || ficha.conta_tipo || "",
        pix_tipo: e.pagamento.pix_tipo || ficha.pix_tipo || "", pix_chave: e.pagamento.pix_chave ?? "",
        // Conta de terceiro: o DP aprova mantendo desmarcado "próprio colaborador";
        // ao marcar, o pedido fica recusado e os dados do terceiro saem da ficha.
        pagamento_terceiro: e.pagamento.titular_proprio === false ? "sim" : "nao",
        titular_nome: e.pagamento.titular_proprio === false ? String(e.pagamento.titular_nome ?? "").toUpperCase() : "",
        titular_cpf: e.pagamento.titular_proprio === false ? String(e.pagamento.titular_cpf ?? "").replace(/\D/g, "") : "",
        titular_relacao: e.pagamento.titular_proprio === false ? String(e.pagamento.titular_relacao ?? "").toUpperCase() : "",
      };
      for (const c of [
        "rg_numero", "rg_orgao", "rg_uf", "rg_emissao", "ctps_numero", "ctps_serie", "ctps_uf", "ctps_expedicao",
        "titulo_eleitor", "titulo_zona", "titulo_secao", "reservista", "reservista_categoria",
        "nome_pai", "nome_mae", "nacionalidade", "naturalidade", "raca_cor", "deficiencia",
      ]) dadosFicha[c] = String(f[c] ?? "");

      await acoes.salvarFicha.mutateAsync({
        dados: dadosFicha,
        pessoas: pessoas
          .filter((p) => p.nome.trim())
          .map((p) => ({
            ...(p.id ? { id: p.id } : {}),
            nome: p.nome.trim(),
            parentesco: p.parentesco,
            data_nascimento: p.data_nascimento || "",
            cpf: p.cpf.replace(/\D/g, ""),
            rg: p.rg.trim(),
            finalidade_dependente: p.finalidade_dependente,
            finalidade_sesc: p.finalidade_sesc,
            finalidades: p.finalidades,
          })),
      });

      const num = (v: string | undefined) => Number(String(v ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
      const regime = VINCULO_PARA_REGIME[String(f.tipo_vinculo ?? "")] ?? admin.regime_trabalho ?? "";
      // Jornada consolidada dos dias trabalhados: nunca grava vazia e avisa
      // com clareza quando algum dia ficou sem horário.
      const jornadaConsolidada = consolidarJornada(e.jornada);
      const carga = cargaSemanal(jornadaConsolidada);
      await acoes.salvarAdmin.mutateAsync({
        data_admissao: String(f.data_admissao ?? ""),
        regime_trabalho: regime,
        cargo_id: String(f.cargo_id ?? ""),
        unidade_id: String(f.unidade_id ?? ""),
        setor_id: String(f.setor_id ?? ""),
        forma_pagamento: e.rem.forma_pagamento ?? "",
        salario: e.rem.salario_base ?? "",
        vale_transporte: !!e.rem.vale_transporte,
        adicional_insalubridade: num(e.rem.insalubridade_percentual) > 0,
        adicional_periculosidade: num(e.rem.periculosidade_percentual) > 0,
        observacoes: admin.observacoes ?? "",
        experiencia_dias: admin.experiencia_dias ?? "",
        jornada: jornadaConsolidada,
        jornada_descricao: descricaoJornada(jornadaConsolidada) || admin.jornada_descricao || "",
        carga_horaria_semanal: carga ? String(carga) : (admin.carga_horaria_semanal ?? ""),
      });
      toast.success("Ficha salva.");
      await refetch();
    } finally {
      setSalvando(false);
    }
  };

  const dependentesNode = (
    <>
                {!pessoas.length && (
                  <p className="text-sm text-muted-foreground">Nenhum dependente ou familiar informado.</p>
                )}
                {pessoas.map((p, i) => (
                  <div key={p.id ?? `novo-${i}`} className="rounded-lg border p-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Nome completo</Label>
                        <Input className="h-10" value={p.nome} disabled={encerrada}
                          onChange={(e) =>
                            setPessoas((l) => l.map((x, j) => (j === i ? { ...x, nome: e.target.value.toUpperCase() } : x)))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Parentesco</Label>
                        <Select value={p.parentesco} disabled={encerrada}
                          onValueChange={(v) => setPessoas((l) => l.map((x, j) => {
                            if (j !== i) return x;
                            const trocado = { ...x, parentesco: v };
                            const permitidas = finalidadesDoFamiliar(v).map((f) => f.codigo);
                            const mantidas = trocado.finalidades.filter((c) => permitidas.includes(c));
                            return comFinalidades(trocado, mantidas.length ? mantidas : permitidas.slice(0, 1));
                          }))}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                          <SelectContent>
                             {opcoesParentesco(p.parentesco).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Data de nascimento</Label>
                        <Input className="h-10" type="date" value={p.data_nascimento} disabled={encerrada}
                          onChange={(e) =>
                            setPessoas((l) => l.map((x, j) => (j === i ? { ...x, data_nascimento: e.target.value } : x)))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CPF</Label>
                        <Input className="h-10" value={p.cpf} disabled={encerrada}
                          onChange={(e) =>
                            setPessoas((l) => l.map((x, j) => (j === i ? { ...x, cpf: mascaraCpf(e.target.value) } : x)))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">RG</Label>
                        <Input className="h-10" value={p.rg} disabled={encerrada}
                          onChange={(e) => setPessoas((l) => l.map((x, j) => (j === i ? { ...x, rg: e.target.value } : x)))} />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Finalidades</Label>
                        {!finalidadesDoFamiliar(p.parentesco).length ? (
                          <p className="text-xs text-muted-foreground">
                            A empresa não liberou finalidades para este parentesco.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {finalidadesDoFamiliar(p.parentesco).map((f) => (
                              <Button
                                key={f.codigo}
                                type="button"
                                size="sm"
                                disabled={encerrada}
                                variant={p.finalidades.includes(f.codigo) ? "default" : "outline"}
                                onClick={() => setPessoas((l) => l.map((x, j) => (j === i
                                  ? comFinalidades(x, x.finalidades.includes(f.codigo)
                                    ? x.finalidades.filter((c) => c !== f.codigo)
                                    : [...x.finalidades, f.codigo])
                                  : x)))}
                              >
                                {f.nome}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={encerrada}
                      onClick={() => setPessoas((l) => l.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4 mr-2" /> Remover
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" disabled={encerrada}
                  onClick={() =>
                    setPessoas((l) => [
                      ...l,
                      {
                        id: null, nome: "", parentesco: "", data_nascimento: "", cpf: "", rg: "",
                        finalidade_dependente: true, finalidade_sesc: false, finalidades: [FINALIDADE_LEGAL],
                      },
                    ])}>

                  <Plus className="h-4 w-4 mr-2" /> Adicionar Dependente
                </Button>
                <p className="text-xs text-muted-foreground">
                  Cada familiar precisa de nome, parentesco e ao menos uma finalidade. As mudanças valem depois
                  de salvar.
                </p>
    </>
  );

  // Não-CLT não tem ficha de registro: a etapa "Registro" some e a aprovação já libera a efetivação.
  const ETAPAS: Array<{ rotulo: string; status: PreadmissaoStatus[] }> = [
    { rotulo: "Preenchimento", status: ["aguardando_preenchimento", "em_preenchimento", "correcao_solicitada", "aguardando_nova_versao"] as PreadmissaoStatus[] },
    { rotulo: "Revisão", status: (isClt ? ["aguardando_revisao"] : ["aguardando_revisao", "pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"]) as PreadmissaoStatus[] },
    ...(isClt ? [{ rotulo: "Registro", status: ["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"] as PreadmissaoStatus[] }] : []),
    { rotulo: "Efetivado", status: ["concluido"] as PreadmissaoStatus[] },
  ];
  const etapaAtual = Math.max(0, ETAPAS.findIndex((e) => e.status.includes(status)));

  // Admissão efetivada: a mesma ficha passa a ser o cadastro do colaborador.
  if (status === "concluido" && colaboradorEfetivado) {
    return (
      <ColaboradorFormDialog
        open={!!preadmissaoId}
        onOpenChange={(v) => !v && onOpenChange(false)}
        colaborador={colaboradorEfetivado}
        abaInicial={jornadaAdmissao ? "jornada" : "dados"}
        jornadaInicial={jornadaAdmissao}
      />
    );
  }

  if (isLoading || !pa || !data || !modo) {
    return (
      <Dialog open={!!preadmissaoId} onOpenChange={(v) => !v && onOpenChange(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pré-Admissão</DialogTitle>
            <DialogDescription>Carregando a ficha…</DialogDescription>
          </DialogHeader>
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  const emConferencia = status === "aguardando_revisao" && !encerrada;
  const faltamAbas = ABAS_CONFERENCIA.filter((a) => !vistas.has(a.aba));
  const idxConf = ABAS_CONFERENCIA.findIndex((a) => a.aba === abaConf);
  const proximaAba = ABAS_CONFERENCIA.slice(idxConf + 1).find((a) => !vistas.has(a.aba)) ?? faltamAbas[0];
  const podeAprovar = faltamAbas.length === 0 && divergenciasOcr.length === 0;
  const asoAtual = ((pa.admin_dados ?? {}) as { aso?: AsoDados }).aso ?? null;
  const fichaOficialPronta = ["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido", "concluido"]
    .includes(status) && (!isClt || asoLiberaContabilidade(asoAtual));

  const etapa = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground sm:hidden">
        Etapa {Math.min(etapaAtual + 1, ETAPAS.length)} de {ETAPAS.length}:{" "}
        <span className="font-medium text-foreground">{ETAPAS[Math.min(etapaAtual, ETAPAS.length - 1)]?.rotulo}</span>
      </p>
      <ol className="hidden flex-wrap items-center gap-1 text-[11px] sm:flex sm:text-xs" aria-label="Etapas da admissão">
        {ETAPAS.map((e, i) => (
          <li key={e.rotulo} className="flex items-center gap-1">
            <span
              className={
                i < etapaAtual
                  ? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
                  : i === etapaAtual
                    ? "rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground"
                    : "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
              }
              aria-current={i === etapaAtual ? "step" : undefined}
            >
              {e.rotulo}
            </span>
            {i < ETAPAS.length - 1 && <span className="text-muted-foreground">›</span>}
          </li>
        ))}
        <li className="ml-auto text-muted-foreground">{PREADMISSAO_STATUS_LABEL[status]}</li>
      </ol>
      {emConferencia && (
        <div className="flex flex-wrap gap-1 text-[11px]" aria-label="Conferência das abas">
          {ABAS_CONFERENCIA.map((a) => {
            const div = a.aba === "dados" && divergenciasOcr.length > 0;
            const ok = vistas.has(a.aba) && !div;
            return (
              <button key={a.aba} type="button" onClick={() => setAbaPedida({ aba: a.aba, n: Date.now() })}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${div ? "border-destructive/50 text-destructive" : ok ? "border-primary/40 text-primary" : "text-muted-foreground"} ${abaConf === a.aba ? "font-semibold" : ""}`}>
                <span className={`h-2 w-2 rounded-full ${div ? "bg-destructive" : ok ? "bg-primary" : "bg-amber-500"}`} aria-hidden="true" />
                {a.rotulo}{div ? " · divergência" : ok ? "" : " · conferir"}
              </button>
            );
          })}
        </div>
      )}
              {divergenciasOcr.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-2">
                  <p className="font-semibold flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="h-4 w-4" /> Documento diferente do cadastro
                  </p>
                  <p className="text-xs text-muted-foreground">A leitura da identidade encontrou diferenças. Confira a foto do documento antes de decidir.</p>
                  {divergenciasOcr.map((d) => (
                    <div key={d.campo} className="rounded-md border bg-background p-2">
                      <p className="text-xs font-medium">{ROTULO_DIVERGENCIA_OCR[d.campo] ?? d.campo}</p>
                      <div className="mt-1 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                        <span><span className="text-muted-foreground">Cadastro: </span>{formatarDivergencia(d.campo, d.cadastro)}</span>
                        <span><span className="text-muted-foreground">Documento: </span>{formatarDivergencia(d.campo, d.documento)}</span>
                      </div>
                      {!encerrada && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => {
                            mudarFicha(d.campo as CampoFicha, d.campo === "cpf" ? mascaraCpf(d.documento) : d.documento);
                            setDivergenciasOcr((l) => l.filter((x) => x.campo !== d.campo));
                            toast.info("Valor do documento aplicado na ficha. Salve a ficha para gravar.");
                          }}>Atualizar pelo Documento</Button>
                          <Button size="sm" variant="ghost" className="h-8"
                            onClick={() => setDivergenciasOcr((l) => l.filter((x) => x.campo !== d.campo))}>
                            Manter Cadastro
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {data.cpf_existente && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm ">
                  <p className="font-semibold text-amber-700">CPF já cadastrado nesta empresa</p>
                  <p className="text-muted-foreground">
                    {data.cpf_existente.situacao === "ativo"
                      ? `${data.cpf_existente.nome} está com cadastro ativo. Confira antes de seguir: não é possível admitir o mesmo CPF duas vezes.`
                      : `${data.cpf_existente.nome} já trabalhou aqui. A conclusão será registrada como recontratação. Cargo, salário, benefícios e jornada devem seguir as condições atuais da nova admissão.`}
                  </p>
                </div>
              )}

              {data.bloqueio.situacao !== "ok" && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm ">
                  <p className="font-semibold flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Atenção
                  </p>
                  <p className="text-muted-foreground">{data.bloqueio.mensagem}</p>
                </div>
              )}

              {pa.correcao_motivo && status === "correcao_solicitada" && (
                <div className="rounded-lg border p-3 text-sm ">
                  <p className="font-semibold">Correção pedida ao candidato</p>
                  <p className="text-muted-foreground">{pa.correcao_motivo}</p>
                </div>
              )}

    </div>
  );

  const acoesRodape = (
    <>
      <Button variant="outline" className="h-11 sm:h-10" disabled={gerando} onClick={() => void gerarFicha()}>
        {gerando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
        {fichaOficialPronta ? "Baixar Ficha de Admissão (PDF)" : "Baixar Prévia da Ficha (PDF)"}
      </Button>
      {emConferencia && proximaAba && (
        <Button variant="secondary" className="h-11 sm:h-10" onClick={() => setAbaPedida({ aba: proximaAba.aba, n: Date.now() })}>
          Avançar para {proximaAba.rotulo}
        </Button>
      )}
      {isClt && status === "pronto_contabilidade" && (
        <Button
          className="h-11 sm:h-10"
          disabled={!asoLiberaContabilidade(asoAtual) || acoes.marcarStatus.isPending}
          title={asoLiberaContabilidade(asoAtual) ? undefined : "Anexe o ASO Apto ou registre a dispensa na aba Documentos."}
          onClick={() => executar(() => acoes.marcarStatus.mutateAsync("enviado_contabilidade"), "Pacote liberado. Baixe a ficha e envie à contabilidade.")}
        >
          Liberar Pacote para Contabilidade
        </Button>
      )}
      {status === "aguardando_revisao" && (
        <Button
          className="h-11 sm:h-10"
          title={podeAprovar ? undefined : divergenciasOcr.length ? "Resolva as divergências do documento na aba Identificação." : `Falta conferir: ${faltamAbas.map((a) => a.rotulo).join(", ")}.`}
          disabled={!podeAprovar || acoes.prepararContabilidade.isPending}
          onClick={() => executar(() => acoes.prepararContabilidade.mutateAsync(), isClt ? "Ficha aprovada. Agora trate o exame admissional na aba Documentos." : "Ficha aprovada.")}
        >
          Aprovar Ficha
        </Button>
      )}
      {podeEfetivar && (
        <Button className="h-11 sm:h-10" disabled={efetivando} onClick={pedirEfetivacao}>
          {efetivando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Efetivar Colaborador
        </Button>
      )}
      <AlertDialog open={confirmarClt} onOpenChange={setConfirmarClt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Efetivar sem ficha de registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Este colaborador é CLT. Ele será cadastrado com base exclusiva nos dados e documentos conferidos nesta
              pré-admissão, sem a ficha de registro da contabilidade. A confirmação fica registrada no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void efetivarDireto(true)}>Confirmar e Efetivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={ativarRotinaAberto} onOpenChange={setAtivarRotinaAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar na rotina da loja</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  A pessoa entra na escala, folgas e plantões da unidade como{" "}
                  <strong>{regimeAtual === "intermitente" ? "freelancer diarista" : "freelancer mensalista"}</strong>,
                  sem acesso ao portal e sem efeito CLT. Ao efetivar a admissão, o mesmo cadastro vira o vínculo
                  oficial e a data de admissão formal passa a contar.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="inicio-rotina" className="text-xs">Início das atividades na loja</Label>
                  <Input
                    id="inicio-rotina"
                    type="date"
                    value={dataInicioRotina}
                    onChange={(e) => setDataInicioRotina(e.target.value)}
                  />
                </div>
                {jornadaAtivacao ? (
                  <p className="rounded-md border bg-muted/30 p-2 text-xs">
                    Horário que vai para a rotina: <strong>{descricaoJornada(jornadaAtivacao)}</strong>.
                    Para ajustar, edite os dias nesta aba e salve a ficha antes de ativar.
                  </p>
                ) : (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-500">
                    Defina o horário de trabalho na aba Horário antes de ativar na rotina.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={ativandoRotina || !jornadaAtivacao || !dataInicioRotina}
              onClick={(e) => {
                e.preventDefault();
                void ativarRotina();
              }}
            >
              {ativandoRotina && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Ativação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  /**
   * Ativação operacional na rotina da loja: vive na aba Horário (jornada),
   * nunca em Documentos — a decisão depende da grade semanal que acabou de
   * ser definida.
   */
  const ativacaoNode = (
    <div className="space-y-3">
      {rotinaInfo && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Store className="h-4 w-4 text-amber-600" aria-hidden="true" />
            Na rotina da loja · aguardando admissão há {diasAguardandoRegistro(rotinaInfo.iniciou_em)}{" "}
            {diasAguardandoRegistro(rotinaInfo.iniciou_em) === 1 ? "dia" : "dias"}
          </p>
          <p className="text-xs text-muted-foreground">
            Atua na loja desde{" "}
            {rotinaInfo.iniciou_em
              ? new Date(`${rotinaInfo.iniciou_em}T00:00:00`).toLocaleDateString("pt-BR")
              : "—"}{" "}
            como {rotinaInfo.forma_provisoria === "diarista" ? "freelancer diarista" : "freelancer mensalista"} —
            sem acesso ao portal e sem efeito CLT. Ao efetivar, o mesmo cadastro vira o vínculo oficial
            e a data de admissão formal passa a valer para férias e demais direitos.
          </p>
        </div>
      )}

      {podeAtivarRotina && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-semibold">Já está trabalhando na loja?</p>
          <p className="text-xs text-muted-foreground">
            Ative na rotina para escala, folgas e plantões enquanto o registro não sai. O sistema trata
            como {regimeAtual === "intermitente" ? "freelancer diarista" : "freelancer mensalista"} —
            sem portal, sem férias e sem efeito CLT até a efetivação.
            {!jornadaAtivacao && " Defina e salve o horário acima para liberar a ativação."}
          </p>
          <Button
            variant="outline"
            disabled={!jornadaAtivacao}
            title={jornadaAtivacao ? undefined : "Defina e salve o horário de trabalho antes de ativar."}
            onClick={() => setAtivarRotinaAberto(true)}
          >
            <Store className="h-4 w-4 mr-2" /> Ativar na Rotina da Loja
          </Button>
        </div>
      )}
    </div>
  );

  const documentosNode = (
    <div className="space-y-6">
      <div className="space-y-3">
                {!vigentes.length && <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>}
                {vigentes.map((d) => (
                  <div key={d.id} className="rounded-lg border p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.requisito_codigo.replace(/_/g, " ")}</span>
                      <Badge variant="secondary">{rotuloParte(d)}</Badge>
                      <span className="text-xs text-muted-foreground">{nomePessoa(d.pessoa_id)}</span>
                      {d.status === "aprovado" && <Badge variant="outline" className="text-emerald-600">Aprovado</Badge>}
                      {d.status === "recusado" && <Badge variant="destructive">Recusado</Badge>}
                      {d.status === "pendente" && <Badge variant="secondary">Em análise</Badge>}
                      <div className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => ver(d.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            executar(
                              () => acoes.avaliarDocumento.mutateAsync({ documento_id: d.id, status: "aprovado" }),
                              "Documento aprovado",
                            )}
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const m = window.prompt("Por que este documento foi recusado?") ?? "";
                            if (m.trim().length < 5) return;
                            executar(
                              () =>
                                acoes.avaliarDocumento.mutateAsync({
                                  documento_id: d.id, status: "recusado", motivo: m.trim(),
                                }),
                              "Documento recusado",
                            );
                          }}
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {d.motivo_recusa && <p className="text-xs text-destructive mt-1">{d.motivo_recusa}</p>}
                  </div>
                ))}
                {!!data.pendencias.length && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                    <p className="font-semibold flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Ainda faltam
                    </p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {data.pendencias.map((p) => (
                        <li key={p.key}>{p.titulo}{p.pessoa_nome ? ` — ${p.pessoa_nome}` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button variant="outline" disabled={baixando || !vigentes.length} onClick={baixarDocumentos}>
                  {baixando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Baixar Documentos
                </Button>
      </div>
      <Separator />
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Admissão</h3>

                {["aguardando_revisao", "aguardando_nova_versao", "em_preenchimento"].includes(status) && (
                  <div className="space-y-2">
                    <Label className="text-xs">Pedir correção ao candidato</Label>
                    <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
                      placeholder="Descreva o que precisa ser corrigido." />
                    <Button
                      variant="outline"
                      disabled={motivo.trim().length < 5 || acoes.solicitarCorrecao.isPending}
                      onClick={() =>
                        executar(() => acoes.solicitarCorrecao.mutateAsync(motivo.trim()), "Correção pedida ao candidato")}
                    >
                      Pedir Correção
                    </Button>
                  </div>
                )}

                {status === "aguardando_revisao" && (
                  <p className="rounded-lg border p-3 text-xs text-muted-foreground">
                    Confira os dados e os documentos e clique em <span className="font-medium text-foreground">Aprovar Ficha</span>.
                    Depois anexe aqui a ficha de registro oficial e efetive o colaborador.
                  </p>
                )}

                {status === "aguardando_revisao" && !podeAprovar && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    {divergenciasOcr.length
                      ? "Há divergência entre o documento e o cadastro: resolva na aba Dados antes de aprovar."
                      : `Para aprovar, abra e confira: ${faltamAbas.map((a) => a.rotulo).join(", ")}.`}
                  </p>
                )}
                {isClt && ["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(status) && (
                  <AsoAdmissionalCard
                    preadmissaoId={pa.id}
                    aso={asoAtual}
                    candidatoNome={ficha.nome || pa.candidato_nome}
                    whatsapp={ficha.whatsapp || (pa as { whatsapp?: string | null }).whatsapp}
                    cargo={cargos.find((c) => c.id === (admin.cargo_id || pa.cargo_previsto_id))?.nome}
                    empresa={(companies.find((c) => c.id === pa.company_id) as { name?: string } | undefined)?.name}
                    encerrada={encerrada}
                    onSalvo={() => void refetch()}
                  />
                )}
                {/* "Registro recebido" também entra aqui: quando a contabilidade
                    envia uma versão nova, a conferência anterior deixa de valer e
                    o gestor precisa poder anexar e conferir novamente. */}
                {isClt && ["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(status) && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-semibold">Ficha de registro oficial</p>
                    <p className="text-xs text-muted-foreground">
                      Primeiro anexe o arquivo recebido. Depois abra, confira e registre a conferência: são
                      dois atos distintos, e o cadastro só é criado após a conferência.
                    </p>
                    <input
                      ref={fichaRef}
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) enviarFichaOficial(f);
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={enviandoFicha} onClick={() => fichaRef.current?.click()}>
                        {enviandoFicha ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}
                        {fichaOficial ? "Anexar Nova Versão" : "Anexar Ficha Oficial"}
                      </Button>
                      {fichaOficial && (
                        <>
                          <Button variant="outline" onClick={() => ver(fichaOficial.id)}>
                            Abrir Ficha Oficial
                          </Button>
                          <Button
                            onClick={() =>
                              executar(
                                () => acoes.conferirFichaOficial.mutateAsync(fichaOficial.id),
                                "Conferência registrada",
                              )}
                          >
                            Registrar Conferência
                          </Button>
                        </>
                      )}
                    </div>
                    {!fichaOficial && (
                      <p className="text-xs text-muted-foreground">Nenhuma ficha oficial anexada ainda.</p>
                    )}
                  </div>
                )}

                {podeEfetivar && (
                  <div className="rounded-lg border border-primary/40 p-3 space-y-2">
                    <p className="text-sm font-semibold">Concluir a admissão</p>
                    <p className="text-xs text-muted-foreground">
                      {isClt && !pa.ficha_oficial_conferida_em
                        ? "A ficha de registro é opcional: você pode efetivar agora com os dados conferidos nesta pré-admissão (pede confirmação)."
                        : "O cadastro é criado com os dados conferidos, dependentes e documentos já enviados."}
                    </p>
                    <Button disabled={efetivando} onClick={pedirEfetivacao}>Efetivar Colaborador</Button>
                  </div>
                )}

                {status === "concluido" && (
                  <p className="text-sm text-emerald-600 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Admissão concluída e cadastro criado.
                  </p>
                )}

                {status !== "concluido" && !pa.colaborador_id && (
                  <div className="pt-2 border-t">
                    <Button variant="outline" className="text-destructive" onClick={() => setExcluir(true)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir Ficha
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      A ficha sai da lista e o link deixa de valer. Os documentos e o histórico continuam guardados.
                    </p>
                  </div>
                )}

                {!!data.eventos.length && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Histórico</h3>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {data.eventos.map((e, i) => (
                        <li key={`${e.created_at}-${i}`}>
                          {new Date(e.created_at).toLocaleString("pt-BR")} — {e.evento.replace(/_/g, " ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
      </div>
    </div>
  );

  /**
   * Campos que a contabilidade pede e o cadastro do colaborador não tem.
   * Ficam guardados na pré-admissão e saem na folha impressa.
   */
  const complementaresNode = (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-semibold">Informações complementares</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Estado civil</Label>
          <Select
            value={ficha.estado_civil || "none"}
            onValueChange={(v) => mudarFicha("estado_civil", v === "none" ? "" : v)}
            disabled={encerrada}
          >
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não informado</SelectItem>
              {ESTADOS_CIVIS.map((e) => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>PIS / PASEP / NIS</Label>
          <Input
            value={ficha.pis ?? ""}
            onChange={(e) => mudarFicha("pis", e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="11 dígitos"
            disabled={encerrada}
          />
        </div>
        <div className="space-y-2">
          <Label>Cidade de nascimento</Label>
          <Input
            value={ficha.naturalidade ?? ""}
            onChange={(e) => mudarFicha("naturalidade", e.target.value)}
            disabled={encerrada}
          />
        </div>
        <div className="space-y-2">
          <Label>UF de nascimento</Label>
          <Input
            value={ficha.naturalidade_uf ?? ""}
            onChange={(e) => mudarFicha("naturalidade_uf", e.target.value.slice(0, 2))}
            placeholder="GO"
            disabled={encerrada}
          />
        </div>
        {[1, 2].map((n) => (
          <div key={n} className="md:col-span-2 grid gap-3 rounded-md border p-3 md:grid-cols-3">
            <p className="md:col-span-3 text-xs font-medium text-muted-foreground">
              Contato de emergência {n}{n === 1 ? " (obrigatório)" : " (opcional)"}
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input
                value={ficha[`emerg${n}_nome`] ?? ""}
                onChange={(e) => mudarFicha(`emerg${n}_nome` as CampoFicha, e.target.value)}
                disabled={encerrada}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Parentesco</Label>
              <Select
                value={ficha[`emerg${n}_parentesco`] || "none"}
                onValueChange={(v) => mudarFicha(`emerg${n}_parentesco` as CampoFicha, v === "none" ? "" : v)}
                disabled={encerrada}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  {PARENTESCOS_EMERGENCIA.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp</Label>
              <Input
                value={maskPhone(ficha[`emerg${n}_whatsapp`] ?? "")}
                onChange={(e) => mudarFicha(`emerg${n}_whatsapp` as CampoFicha, e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="(62) 99999-9999"
                inputMode="tel"
                disabled={encerrada}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <ColaboradorFormDialog
        open={!!preadmissaoId}
        onOpenChange={(v) => !v && onOpenChange(false)}
        admissao={{
          chave: `${fichaDe ?? "carregando"}:${(pa as { versao?: number }).versao ?? ""}:${pa.admin_dados ? JSON.stringify(pa.admin_dados).length : 0}`,
          form: modo,
          endereco: {
            cep: ficha.cep ?? "", logradouro: ficha.endereco ?? "", numero: ficha.numero ?? "",
            complemento: ficha.complemento ?? "", bairro: ficha.bairro ?? "", cidade: ficha.cidade ?? "", uf: ficha.uf ?? "",
          },
          pagamento: {
            banco_nome: ficha.banco_nome ?? "", agencia: ficha.agencia ?? "", conta: ficha.conta ?? "",
            conta_digito: ficha.conta_digito ?? "", conta_tipo: ficha.conta_tipo ?? "",
            pix_tipo: ficha.pix_tipo ?? "", pix_chave: ficha.pix_chave ?? "",
            titular_proprio: ficha.pagamento_terceiro !== "sim",
            titular_nome: ficha.pagamento_terceiro === "sim" ? ficha.titular_nome ?? "" : "",
            titular_cpf: ficha.pagamento_terceiro === "sim" ? maskCpf(ficha.titular_cpf ?? "") : "",
            titular_relacao: ficha.pagamento_terceiro === "sim" ? ficha.titular_relacao ?? "" : "",
          },
          rem: {
            ...(admin.forma_pagamento ? { forma_pagamento: admin.forma_pagamento as never } : {}),
            ...(admin.salario ? { salario_base: String(admin.salario).replace(".", ",") } : {}),
            ...(admin.vale_transporte ? { vale_transporte: admin.vale_transporte === "sim" } : {}),
          },
          jornada: jornadaAdmissao,
          jornadaExtra: ativacaoNode,
          complementares: complementaresNode,
          etapa,
          acoes: acoesRodape,
          dependentes: <div className="space-y-3">{dependentesNode}</div>,
          documentos: documentosNode,
          somenteLeitura: encerrada,
          onAbaChange: marcarAba,
          abaPedida,
          salvando,
          onSalvar: salvarUnificado,
        }}
      />
      <PreadmissaoExcluirDialog
        preadmissaoId={excluir ? preadmissaoId : null}
        candidatoNome={data.preadmissao.candidato_nome ?? ""}
        onOpenChange={setExcluir}
        onExcluida={() => onOpenChange(false)}
      />
      {termoTerceiroDe && pa && (
        <TermoContaTerceiroPreviaDialog
          open
          onOpenChange={(v) => { if (!v) setTermoTerceiroDe(null); }}
          companyId={pa.company_id}
          colaboradorId={termoTerceiroDe}
          pagamento={{
            ...PAGAMENTO_BLANK,
            banco_nome: ficha.banco_nome ?? "", agencia: ficha.agencia ?? "", conta: ficha.conta ?? "",
            conta_digito: ficha.conta_digito ?? "", conta_tipo: ficha.conta_tipo ?? "",
            pix_tipo: ficha.pix_tipo ?? "", pix_chave: ficha.pix_chave ?? "",
            titular_proprio: false, titular_nome: ficha.titular_nome ?? "",
            titular_cpf: ficha.titular_cpf ?? "", titular_relacao: ficha.titular_relacao ?? "",
          }}
          partes={(() => {
            const emp = (companies ?? []).find((c: { id: string }) => c.id === pa.company_id) as
              { name?: string; trade_name?: string; cnpj?: string } | undefined;
            return {
              empresa: String(emp?.name || emp?.trade_name || "EMPRESA").toUpperCase(),
              cnpj: emp?.cnpj ?? null,
              unidade: unidades.find((u) => u.id === admin.unidade_id)?.nome ?? null,
              nome: String(ficha.nome ?? pa.candidato_nome ?? "").toUpperCase(),
              cpf: ficha.cpf || pa.cpf || null,
              cargo: (cargos as Array<{ id: string; nome: string }>).find((c) => c.id === admin.cargo_id)?.nome ?? null,
            };
          })()}
          onEmitido={() => setTermoTerceiroDe(null)}
        />
      )}
    </>
  );
}

const REGIME_PARA_VINCULO: Record<string, string> = {
  clt: "CLT", intermitente: "Intermitente", estagio: "Estagiario", temporario: "Temporario",
  pj: "PJ", mei: "PJ", freelancer: "Freelancer",
};
const VINCULO_PARA_REGIME: Record<string, string> = {
  CLT: "clt", Intermitente: "intermitente", Socio: "pj", Estagiario: "estagio",
  PJ: "pj", Temporario: "temporario", Freelancer: "freelancer",
};

const minutosDe = (h?: string | null) => {
  const m = /^(\d{2}):(\d{2})/.exec(h ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Horas semanais a partir do horário escolhido (para a contabilidade). */
function cargaSemanal(j: JornadaRascunho | null): number | null {
  if (!j) return null;
  let total = 0;
  for (const d of j.dias ?? []) {
    if (!d.trabalha) continue;
    const ent = minutosDe(d.entrada ?? j.horario.entrada);
    const sai = minutosDe(d.saida ?? j.horario.saida);
    if (ent === null || sai === null) continue;
    const dur = (sai > ent ? sai - ent : sai + 1440 - ent) - (d.intervalo_minutos ?? j.horario.intervalo_minutos ?? 0);
    if (dur > 0) total += dur;
  }
  const horas = Math.round(total / 60);
  return horas >= 1 && horas <= 60 ? horas : null;
}

/**
 * Consolida a jornada da ficha: deriva o horário principal dos dias
 * trabalhados quando o campo-base está vazio e completa os dias com o
 * horário principal. Devolve null quando não há dia trabalhado; lança erro
 * claro quando um dia trabalhado ficou sem horário — nunca grava jornada
 * vazia nem finge sucesso com dados incompletos.
 */
function consolidarJornada(j: JornadaRascunho | null): JornadaRascunho | null {
  if (!j) return null;
  const dias = (j.dias ?? []).map((d) => ({ ...d }));
  const trabalhados = dias.filter((d) => d.trabalha);
  if (!trabalhados.length) return null;
  let horario = { ...(j.horario ?? {}) };
  if (!horario.entrada || !horario.saida) {
    const comHora = trabalhados.find((d) => d.entrada && d.saida);
    if (comHora) {
      horario = {
        entrada: comHora.entrada!,
        saida: comHora.saida!,
        intervalo_minutos: comHora.intervalo_minutos ?? horario.intervalo_minutos ?? 0,
      };
    }
  }
  const diasCompletos = dias.map((d) =>
    d.trabalha
      ? {
          ...d,
          entrada: d.entrada || horario.entrada || null,
          saida: d.saida || horario.saida || null,
          intervalo_minutos: d.intervalo_minutos ?? horario.intervalo_minutos ?? 0,
        }
      : d,
  );
  const incompleto = diasCompletos.some((d) => d.trabalha && (!d.entrada || !d.saida));
  if (incompleto) {
    throw new Error("Informe a entrada e a saída de todos os dias trabalhados na aba Horário antes de salvar.");
  }
  return { horario, dias: diasCompletos, folga_variavel: j.folga_variavel === true };
}

/** Jornada consolidada sem lançar erro (para habilitar/descrever a ativação). */
function jornadaConsolidadaOuNull(j: JornadaRascunho | null): JornadaRascunho | null {
  try {
    return consolidarJornada(j);
  } catch {
    return null;
  }
}

function descricaoJornada(j: JornadaRascunho | null): string {
  if (!j?.horario?.entrada || !j.horario.saida) return "";
  const dias = (j.dias ?? []).filter((d) => d.trabalha).length;
  const intervalo = j.horario.intervalo_minutos ? `, intervalo de ${j.horario.intervalo_minutos} min` : "";
  return `${j.horario.entrada} às ${j.horario.saida}${intervalo}, ${dias} dia(s) por semana${j.folga_variavel ? ", folga variável" : ""}`;
}

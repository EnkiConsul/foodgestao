/**
 * Revisão da Pré-Admissão pelo gestor na FICHA ÚNICA: é a mesma tela do
 * cadastro manual do colaborador (sindicato, espelho de jornada, piso do
 * cargo, benefícios), aberta em modo "Em Admissão". Nada entra no cadastro
 * oficial antes da efetivação.
 *
 * O gestor corrige o que o candidato preencheu, gera a ficha para a
 * contabilidade, aguarda o retorno e só então conclui a admissão. Toda
 * gravação passa pelo servidor, que revalida campos e permissões.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Clock, Download, Eye, FileUp, Loader2, Plus, Printer, Trash2, XCircle,
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
  "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf",
  "rg_numero", "rg_orgao", "rg_uf", "rg_emissao",
  "ctps_numero", "ctps_serie", "ctps_uf", "ctps_expedicao",
  "titulo_eleitor", "titulo_zona", "titulo_secao",
  "reservista", "reservista_categoria", "pis",
  "banco_nome", "agencia", "conta", "conta_digito", "conta_tipo",
  "pix_tipo", "pix_chave",
] as const;

type CampoFicha = (typeof CAMPOS_FICHA_EDITAVEIS)[number];

/** Nomes próprios e endereços ficam em CAIXA ALTA, como no cadastro. */
const CAIXA_ALTA: ReadonlySet<string> = new Set([
  "nome", "nome_social", "nome_mae", "nome_pai", "naturalidade", "naturalidade_uf",
  "endereco", "complemento", "bairro", "cidade", "uf", "banco_nome",
  "rg_orgao", "rg_uf", "ctps_uf", "reservista_categoria", "nacionalidade",
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
  ["nome", "Nome"], ["cpf", "CPF"], ["data_nascimento", "Nascimento"], ["sexo", "Sexo"],
  ["estado_civil", "Estado civil"], ["nome_mae", "Nome da mãe"], ["nome_pai", "Nome do pai"],
  ["grau_instrucao", "Escolaridade"], ["telefone", "Telefone"], ["email", "E-mail"],
  ["cep", "CEP"], ["endereco", "Endereço"], ["numero", "Número"], ["bairro", "Bairro"],
  ["cidade", "Cidade"], ["uf", "UF"], ["rg_numero", "RG"], ["pis", "PIS"],
  ["ctps_numero", "CTPS"], ["titulo_eleitor", "Título de eleitor"], ["reservista", "Reservista"],
  ["banco_nome", "Banco"], ["agencia", "Agência"], ["conta", "Conta"],
  ["pix_tipo", "Tipo de chave Pix"], ["pix_chave", "Chave Pix"],
];

const ROTULOS_OPCOES: Record<string, Record<string, string>> = {
  sexo: Object.fromEntries(SEXOS.map((s) => [s.value, s.label])),
  estado_civil: Object.fromEntries(ESTADOS_CIVIS.map((s) => [s.value, s.label])),
  grau_instrucao: Object.fromEntries(INSTRUCOES.map((s) => [s.value, s.label])),
  conta_tipo: Object.fromEntries(CONTA_TIPOS.map((s) => [s.value, s.label])),
  pix_tipo: Object.fromEntries(PIX_TIPOS.map((s) => [s.value, s.label])),
};

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
  const [motivo, setMotivo] = useState("");
  const [admin, setAdmin] = useState<Record<string, string>>({});
  const [ficha, setFicha] = useState<Record<string, string>>({});
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
  /** Recontratação: horário do vínculo anterior carregado como sugestão. */
  const [jornadaHistorico, setJornadaHistorico] = useState<JornadaRascunho | null>(null);
  /** Muda a cada carregamento do histórico, para a ficha recarregar os campos. */
  const [historicoVersao, setHistoricoVersao] = useState(0);

  const pa = data?.preadmissao;
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
    setFicha(out);
  }, [pa?.id, pa?.dados, pa?.candidato_nome, pa?.cpf]);

  useEffect(() => {
    setPessoas(
      (data?.pessoas ?? []).map((p) => ({
        id: p.id,
        nome: p.nome ?? "",
        parentesco: (p.parentesco ?? "").toLowerCase(),
        data_nascimento: p.data_nascimento ?? "",
        cpf: p.cpf ? mascaraCpf(p.cpf) : "",
        rg: p.rg ?? "",
        finalidade_dependente: !!p.finalidade_dependente,
        finalidade_sesc: !!p.finalidade_sesc,
      })),
    );
  }, [data?.pessoas]);

  const mudarFicha = (campo: CampoFicha, valor: string) =>
    setFicha((f) => ({ ...f, [campo]: CAIXA_ALTA.has(campo) ? valor.toUpperCase() : valor }));

  /**
   * Recontratação: traz cargo, unidade, setor, vínculo, remuneração e horário do
   * vínculo anterior deste mesmo CPF. É apenas SUGESTÃO na tela — nada é gravado
   * antes de salvar a ficha, e o que o candidato preencheu não é apagado.
   */
  const carregarHistorico = () => {
    const h = data?.cpf_existente?.historico;
    if (!h || encerrada) return;
    const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
    setAdmin((a) => ({
      ...a,
      cargo_id: txt(h.cargo_id) || a.cargo_id,
      unidade_id: txt(h.unidade_id) || a.unidade_id,
      setor_id: txt(h.setor_id) || a.setor_id,
      regime_trabalho: txt(h.regime_trabalho) || a.regime_trabalho,
      salario: txt(h.salario) || a.salario,
      forma_pagamento: txt(h.forma_pagamento) || a.forma_pagamento,
      vale_transporte: h.vale_transporte ? "sim" : a.vale_transporte,
    }));
    if (h.jornada?.horario?.entrada) {
      setJornadaHistorico({
        horario: {
          entrada: h.jornada.horario.entrada ?? "",
          saida: h.jornada.horario.saida ?? "",
          intervalo_minutos: h.jornada.horario.intervalo_minutos ?? 0,
        },
        dias: h.jornada.dias.map((d) => ({
          dow: d.dow,
          trabalha: d.trabalha,
          turno_id: d.turno_id,
          entrada: d.entrada,
          saida: d.saida,
          intervalo_minutos: d.intervalo_minutos,
          setor_id: d.setor_id,
        })),
        folga_variavel: h.jornada.folga_variavel,
      });
    }
    setHistoricoVersao((v) => v + 1);
    toast.success(
      h.jornada?.horario?.entrada
        ? "Histórico carregado: confira a remuneração e o horário antes de salvar."
        : "Histórico carregado: confira a remuneração antes de salvar. O vínculo anterior não tinha horário gravado.",
    );
  };



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
   * Folha imprimível com tudo que a contabilidade precisa conferir, em nomes
   * de tela: nenhum código interno de cargo, unidade ou setor aparece.
   */
  const imprimirPacote = () => {
    if (!data) return;
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m] as string));
    const admDados = (data.preadmissao.admin_dados ?? {}) as Record<string, unknown>;
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
      .map(([campo, rotulo]) => [rotulo, valorAdmin(campo)] as const)
      .filter(([, v]) => v.trim() !== "")
      .map(([rotulo, v]) => `<tr><th>${esc(rotulo)}</th><td>${esc(v)}</td></tr>`)
      .join("");
    const linhaPessoal = CAMPOS_IMPRESSAO
      .map(([campo, rotulo]) => [rotulo, valorFicha(campo, dados[campo])] as const)
      .filter(([, v]) => v.trim() !== "")
      .map(([rotulo, v]) => `<tr><th>${esc(rotulo)}</th><td>${esc(v)}</td></tr>`)
      .join("");
    const vaga = [
      cargos.find((c) => c.id === (admDados.cargo_id ?? data.preadmissao.cargo_previsto_id))?.nome,
      unidades.find((u) => u.id === (admDados.unidade_id ?? data.preadmissao.unidade_prevista_id))?.nome,
    ].filter(Boolean).join(" — ");
    const listaPessoas = (data.pessoas ?? [])
      .map((pe) => {
        const finalidades = [
          pe.finalidade_dependente ? "Dependente" : null,
          pe.finalidade_sesc ? "Sesc" : null,
        ].filter(Boolean).join(" e ");
        const partes = [
          PARENTESCO_LABEL[(pe.parentesco ?? "").toLowerCase()] ?? pe.parentesco ?? "",
          pe.data_nascimento ? `Nascimento: ${pe.data_nascimento}` : null,
          pe.cpf ? `CPF: ${pe.cpf}` : null,
          pe.rg ? `RG: ${pe.rg}` : null,
          finalidades ? `Finalidade: ${finalidades}` : null,
        ].filter(Boolean).join(" — ");
        return `<li><strong>${esc(pe.nome)}</strong> — ${esc(partes)}</li>`;
      })
      .join("");
    const tituloDoc = (codigo: string) =>
      (data.checklist ?? []).find((c) => c.codigo === codigo)?.titulo ?? codigo.replace(/_/g, " ");
    const docs = (data.documentos ?? [])
      .filter((d) => !d.substituido_em)
      .map((d) => {
        const titular = d.pessoa_id
          ? (data.pessoas ?? []).find((p) => p.id === d.pessoa_id)?.nome ?? "Familiar"
          : data.preadmissao.candidato_nome;
        const st = STATUS_DOC_LABEL[d.status] ?? d.status;
        const recusa = d.status === "recusado" && d.motivo_recusa ? ` — Motivo: ${d.motivo_recusa}` : "";
        return `<li>${esc(tituloDoc(d.requisito_codigo))} — Titular: ${esc(titular)} — ${esc(st)}${esc(recusa)}</li>`;
      })
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Ficha de admissão — ${esc(data.preadmissao.candidato_nome)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:18px}h2{font-size:14px;margin-top:20px}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}
th{width:220px;background:#f6f6f6}ul{font-size:12px}p{font-size:12px}</style></head><body>
<h1>Ficha de admissão para a contabilidade — ${esc(data.preadmissao.candidato_nome)}</h1>
${vaga ? `<p><strong>Vaga:</strong> ${esc(vaga)}</p>` : ""}
<h2>Dados do candidato</h2><table>${linhaPessoal || "<tr><td>Sem dados preenchidos</td></tr>"}</table>
<h2>Informações administrativas</h2><table>${linhaAdmin || "<tr><td>Sem informações preenchidas</td></tr>"}</table>
<h2>Dependentes e familiares</h2><ul>${listaPessoas || "<li>Nenhum</li>"}</ul>
<h2>Documentos recebidos</h2><ul>${docs || "<li>Nenhum</li>"}</ul>
</body></html>`;
    // Impressão por quadro interno: não depende de liberar pop-up nem de
    // gravar HTML na janela, o que falha em janela bloqueada.
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        toast.error("Não foi possível abrir a impressão. Tente novamente.");
      }
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
    document.body.appendChild(frame);
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
          })),
      });

      const num = (v: string | undefined) => Number(String(v ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
      const regime = VINCULO_PARA_REGIME[String(f.tipo_vinculo ?? "")] ?? admin.regime_trabalho ?? "";
      const carga = cargaSemanal(e.jornada);
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
        jornada: e.jornada && e.jornada.horario?.entrada ? e.jornada : null,
        jornada_descricao: descricaoJornada(e.jornada) || admin.jornada_descricao || "",
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
                          onValueChange={(v) => setPessoas((l) => l.map((x, j) => (j === i ? { ...x, parentesco: v } : x)))}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                          <SelectContent>
                            {PARENTESCOS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
                      <div className="space-y-1">
                        <Label className="text-xs">Finalidade</Label>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" disabled={encerrada}
                            variant={p.finalidade_dependente ? "default" : "outline"}
                            onClick={() =>
                              setPessoas((l) =>
                                l.map((x, j) => (j === i ? { ...x, finalidade_dependente: !x.finalidade_dependente } : x)))}>
                            Dependente
                          </Button>
                          <Button type="button" size="sm" disabled={encerrada}
                            variant={p.finalidade_sesc ? "default" : "outline"}
                            onClick={() =>
                              setPessoas((l) => l.map((x, j) => (j === i ? { ...x, finalidade_sesc: !x.finalidade_sesc } : x)))}>
                            Sesc
                          </Button>
                        </div>
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
                        finalidade_dependente: true, finalidade_sesc: false,
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

  const ETAPAS: Array<{ rotulo: string; status: PreadmissaoStatus[] }> = [
    { rotulo: "Preenchimento", status: ["aguardando_preenchimento", "em_preenchimento", "correcao_solicitada", "aguardando_nova_versao"] as PreadmissaoStatus[] },
    { rotulo: "Revisão", status: ["aguardando_revisao"] as PreadmissaoStatus[] },
    { rotulo: "Contabilidade", status: ["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade"] as PreadmissaoStatus[] },
    { rotulo: "Retorno", status: ["registro_recebido"] as PreadmissaoStatus[] },
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

  const etapa = (
    <div className="space-y-2">
      <ol className="flex flex-wrap items-center gap-1 text-[11px] sm:text-xs" aria-label="Etapas da admissão">
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
              {data.cpf_existente && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm ">
                  <p className="font-semibold text-amber-700">CPF já cadastrado nesta empresa</p>
                  <p className="text-muted-foreground">
                    {data.cpf_existente.situacao === "ativo"
                      ? `${data.cpf_existente.nome} está com cadastro ativo. Confira antes de seguir: não é possível admitir o mesmo CPF duas vezes.`
                      : `${data.cpf_existente.nome} já trabalhou aqui. A conclusão será registrada como recontratação.`}
                  </p>
                  {data.cpf_existente.historico && !encerrada && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={carregarHistorico}
                    >
                      Carregar Histórico Do Colaborador
                    </Button>
                  )}
                  {data.cpf_existente.historico && !encerrada && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Traz cargo, unidade, vínculo, remuneração e horário do vínculo anterior como sugestão.
                    </p>
                  )}
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
      <Button variant="outline" className="h-11 sm:h-10" onClick={imprimirPacote}>
        <Printer className="h-4 w-4 mr-2" /> Gerar Ficha Para A Contabilidade
      </Button>
      {status === "aguardando_revisao" && (
        <Button
          variant="secondary"
          className="h-11 sm:h-10"
          disabled={acoes.prepararContabilidade.isPending}
          onClick={() => executar(() => acoes.prepararContabilidade.mutateAsync(), "Ficha pronta para a contabilidade")}
        >
          Enviar Para A Contabilidade
        </Button>
      )}
      {status === "registro_recebido" && pa.ficha_oficial_conferida_em && (
        <Button
          variant="secondary"
          className="h-11 sm:h-10"
          onClick={() => navigate(`/dp/colaboradores/importar-ficha?preadmissao=${pa.id}`)}
        >
          Efetivar Admissão
        </Button>
      )}
    </>
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
        <h3 className="text-sm font-semibold">Admissão E Contabilidade</h3>
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
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-semibold">Preparar para a contabilidade</p>
                    <p className="text-xs text-muted-foreground">
                      A ficha é conferida e fica pronta para envio. O cadastro do colaborador só é criado no
                      final, depois do retorno da contabilidade.
                    </p>
                    <Button
                      disabled={acoes.prepararContabilidade.isPending}
                      onClick={() =>
                        executar(() => acoes.prepararContabilidade.mutateAsync(), "Ficha pronta para a contabilidade")}
                    >
                      Preparar Para A Contabilidade
                    </Button>
                  </div>
                )}

                {status === "pronto_contabilidade" && (
                  <Button
                    onClick={() =>
                      executar(() => acoes.marcarStatus.mutateAsync("enviado_contabilidade"), "Envio registrado")}
                  >
                    Marcar Como Enviada À Contabilidade
                  </Button>
                )}

                {status === "enviado_contabilidade" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      executar(
                        () => acoes.marcarStatus.mutateAsync("aguardando_retorno_contabilidade"),
                        "Aguardando o retorno da contabilidade",
                      )}
                  >
                    Aguardando Retorno Da Contabilidade
                  </Button>
                )}

                {/* "Registro recebido" também entra aqui: quando a contabilidade
                    envia uma versão nova, a conferência anterior deixa de valer e
                    o gestor precisa poder anexar e conferir novamente. */}
                {["enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(status) && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-semibold">Ficha oficial devolvida pela contabilidade</p>
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

                {status === "registro_recebido" && (
                  <div className="rounded-lg border border-primary/40 p-3 space-y-2">
                    <p className="text-sm font-semibold">Concluir a admissão</p>
                    {pa.ficha_oficial_conferida_em ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Confira os dados da ficha oficial e crie o cadastro. Esta pré-admissão é concluída na
                          mesma operação, com os dependentes e documentos já enviados.
                        </p>
                        <Button onClick={() => navigate(`/dp/colaboradores/importar-ficha?preadmissao=${pa.id}`)}>
                          Concluir Como Colaborador
                        </Button>
                      </>
                    ) : (
                      /* Versão nova recebida: a conferência anterior não vale mais
                         e a conclusão fica bloqueada até a nova conferência. */
                      <p className="text-xs text-amber-600">
                        A ficha oficial foi substituída. Abra a versão mais recente e registre a conferência acima
                        para liberar a criação do cadastro.
                      </p>
                    )}
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
      <p className="text-sm font-semibold">Informações para a contabilidade</p>
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
        <div className="space-y-2 md:col-span-2">
          <Label>Contato de recado (WhatsApp)</Label>
          <Input
            value={ficha.whatsapp_contato ?? ""}
            onChange={(e) => mudarFicha("whatsapp_contato", e.target.value)}
            placeholder="(62) 99999-9999 — Nome do contato"
            disabled={encerrada}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ColaboradorFormDialog
        open={!!preadmissaoId}
        onOpenChange={(v) => !v && onOpenChange(false)}
        admissao={{
          chave: `${pa.id}:${(pa as { versao?: number }).versao ?? ""}:${pa.admin_dados ? JSON.stringify(pa.admin_dados).length : 0}:h${historicoVersao}`,
          form: modo,
          endereco: {
            cep: ficha.cep ?? "", logradouro: ficha.endereco ?? "", numero: ficha.numero ?? "",
            complemento: ficha.complemento ?? "", bairro: ficha.bairro ?? "", cidade: ficha.cidade ?? "", uf: ficha.uf ?? "",
          },
          pagamento: {
            banco_nome: ficha.banco_nome ?? "", agencia: ficha.agencia ?? "", conta: ficha.conta ?? "",
            conta_digito: ficha.conta_digito ?? "", conta_tipo: ficha.conta_tipo ?? "",
            pix_tipo: ficha.pix_tipo ?? "", pix_chave: ficha.pix_chave ?? "",
          },
          rem: {
            ...(admin.forma_pagamento ? { forma_pagamento: admin.forma_pagamento as never } : {}),
            ...(admin.salario ? { salario_base: String(admin.salario).replace(".", ",") } : {}),
            ...(admin.vale_transporte ? { vale_transporte: admin.vale_transporte === "sim" } : {}),
          },
          jornada: jornadaHistorico ?? jornadaAdmissao,
          complementares: complementaresNode,
          etapa,
          acoes: acoesRodape,
          dependentes: <div className="space-y-3">{dependentesNode}</div>,
          documentos: documentosNode,
          somenteLeitura: encerrada,
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

function descricaoJornada(j: JornadaRascunho | null): string {
  if (!j?.horario?.entrada || !j.horario.saida) return "";
  const dias = (j.dias ?? []).filter((d) => d.trabalha).length;
  const intervalo = j.horario.intervalo_minutos ? `, intervalo de ${j.horario.intervalo_minutos} min` : "";
  return `${j.horario.entrada} às ${j.horario.saida}${intervalo}, ${dias} dia(s) por semana${j.folga_variavel ? ", folga variável" : ""}`;
}

/**
 * Revisão da Pré-Admissão pelo gestor, no MESMO formato da ficha do
 * colaborador: abas Dados, Horário de Trabalho, Remuneração, Dependentes,
 * Documentos e Admissão, com todos os campos editáveis.
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

  const abas = [
    ["dados", "Dados"],
    ["jornada", "Horário de Trabalho"],
    ["remuneracao", "Remuneração"],
    ["dependentes", "Dependentes"],
    ["documentos", "Documentos"],
    ["admissao", "Admissão"],
  ];

  return (
    <Dialog open={!!preadmissaoId} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-w-4xl p-0 gap-0 max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>Pré-Admissão: {pa?.candidato_nome ?? ""}</DialogTitle>
          <DialogDescription>
            {PREADMISSAO_STATUS_LABEL[status]}{pa?.whatsapp ? ` · ${pa.whatsapp}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !pa ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando a ficha…
          </div>
        ) : (
          <Tabs value={aba} onValueChange={setAba} className="flex-1 min-h-0 flex flex-col">
            <div className="px-6">
              <TabsList className="flex-wrap h-auto">
                {abas.map(([v, rotulo]) => (
                  <TabsTrigger key={v} value={v}>{rotulo}</TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
              {data.cpf_existente && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm mb-4">
                  <p className="font-semibold text-amber-700">CPF já cadastrado nesta empresa</p>
                  <p className="text-muted-foreground">
                    {data.cpf_existente.situacao === "ativo"
                      ? `${data.cpf_existente.nome} está com cadastro ativo. Confira antes de seguir: não é possível admitir o mesmo CPF duas vezes.`
                      : `${data.cpf_existente.nome} já trabalhou aqui. A conclusão será registrada como recontratação.`}
                  </p>
                </div>
              )}

              {data.bloqueio.situacao !== "ok" && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm mb-4">
                  <p className="font-semibold flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Atenção
                  </p>
                  <p className="text-muted-foreground">{data.bloqueio.mensagem}</p>
                </div>
              )}

              {pa.correcao_motivo && status === "correcao_solicitada" && (
                <div className="rounded-lg border p-3 text-sm mb-4">
                  <p className="font-semibold">Correção pedida ao candidato</p>
                  <p className="text-muted-foreground">{pa.correcao_motivo}</p>
                </div>
              )}

              {/* ── Dados ─────────────────────────────────────────────── */}
              <TabsContent value="dados" className="mt-0 space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">{campoTexto("nome", "Nome completo")}</div>
                  <div className="sm:col-span-2">
                    {campoTexto("nome_social", "Nome social / Como prefere ser chamado", {
                      placeholder: "Ex: Júnior",
                      dica: "Usado no dia a dia. Os documentos oficiais continuam com o nome completo.",
                    })}
                  </div>
                  {campoTexto("cpf", "CPF")}
                  {campoTexto("data_nascimento", "Data de nascimento", { tipo: "date" })}
                  {campoTexto("email", "E-mail")}
                  {campoTexto("telefone", "WhatsApp")}
                  {campoTexto("whatsapp_contato", "WhatsApp de recado")}
                  {campoLista("sexo", "Sexo", SEXOS)}
                  {campoLista("estado_civil", "Estado civil", ESTADOS_CIVIS)}
                  {campoLista("grau_instrucao", "Escolaridade", INSTRUCOES)}
                  {campoTexto("nome_mae", "Nome da mãe")}
                  {campoTexto("nome_pai", "Nome do pai")}
                  {campoTexto("nacionalidade", "Nacionalidade")}
                  {campoTexto("naturalidade", "Cidade de nascimento")}
                  {campoTexto("naturalidade_uf", "UF de nascimento")}
                  {campoTexto("raca_cor", "Cor / raça")}
                  {campoTexto("deficiencia", "Deficiência")}
                </div>

                <Separator />
                <h3 className="text-sm font-semibold">Endereço</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {campoTexto("cep", "CEP")}
                  {campoTexto("endereco", "Rua / Avenida")}
                  {campoTexto("numero", "Número")}
                  {campoTexto("complemento", "Complemento")}
                  {campoTexto("bairro", "Bairro")}
                  {campoTexto("cidade", "Cidade")}
                  {campoTexto("uf", "UF")}
                </div>

                <Separator />
                <h3 className="text-sm font-semibold">Documentos Pessoais</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {campoTexto("rg_numero", "RG")}
                  {campoTexto("rg_orgao", "Órgão emissor")}
                  {campoTexto("rg_uf", "UF do RG")}
                  {campoTexto("rg_emissao", "Emissão do RG", { tipo: "date" })}
                  {campoTexto("pis", "PIS")}
                  {campoTexto("ctps_numero", "Carteira de trabalho")}
                  {campoTexto("ctps_serie", "Série")}
                  {campoTexto("ctps_uf", "UF da carteira")}
                  {campoTexto("ctps_expedicao", "Expedição da carteira", { tipo: "date" })}
                  {campoTexto("titulo_eleitor", "Título de eleitor")}
                  {campoTexto("titulo_zona", "Zona")}
                  {campoTexto("titulo_secao", "Seção")}
                  {campoTexto("reservista", "Reservista")}
                  {campoTexto("reservista_categoria", "Categoria da reservista")}
                </div>

                <Separator />
                <h3 className="text-sm font-semibold">Dados Bancários E Pix</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {campoTexto("banco_nome", "Banco")}
                  {campoLista("conta_tipo", "Tipo de conta", CONTA_TIPOS)}
                  {campoTexto("agencia", "Agência")}
                  {campoTexto("conta", "Conta")}
                  {campoTexto("conta_digito", "Dígito")}
                  {campoLista("pix_tipo", "Tipo de chave Pix", PIX_TIPOS)}
                  <div className="sm:col-span-2">{campoTexto("pix_chave", "Chave Pix")}</div>
                </div>
              </TabsContent>

              {/* ── Horário de trabalho ───────────────────────────────── */}
              <TabsContent value="jornada" className="mt-0 space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-adm-data">Data de admissão</Label>
                    <Input id="pa-adm-data" type="date" className="h-10" value={admin.data_admissao}
                      disabled={encerrada}
                      onChange={(e) => setAdmin({ ...admin, data_admissao: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-adm-vinculo">Vínculo</Label>
                    <Select value={admin.regime_trabalho} disabled={encerrada}
                      onValueChange={(v) => setAdmin({ ...admin, regime_trabalho: v })}>
                      <SelectTrigger id="pa-adm-vinculo" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {REGIMES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-adm-unidade">Unidade</Label>
                    <Select value={admin.unidade_id} disabled={encerrada}
                      onValueChange={(v) => setAdmin({ ...admin, unidade_id: v, setor_id: "" })}>
                      <SelectTrigger id="pa-adm-unidade" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-adm-setor">Setor</Label>
                    <Select value={admin.setor_id} disabled={encerrada || !admin.unidade_id}
                      onValueChange={(v) => setAdmin({ ...admin, setor_id: v })}>
                      <SelectTrigger id="pa-adm-setor" className="h-10">
                        <SelectValue placeholder={admin.unidade_id ? "Escolher" : "Escolha a unidade"} />
                      </SelectTrigger>
                      <SelectContent>
                        {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-adm-carga">Carga semanal (horas)</Label>
                    <Input id="pa-adm-carga" className="h-10" inputMode="numeric" value={admin.carga_horaria_semanal}
                      disabled={encerrada} placeholder="Ex.: 44"
                      onChange={(e) => setAdmin({ ...admin, carga_horaria_semanal: e.target.value.replace(/[^\d]/g, "") })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-adm-exp">Experiência (dias)</Label>
                    <Input id="pa-adm-exp" className="h-10" inputMode="numeric" value={admin.experiencia_dias}
                      disabled={encerrada} placeholder="Ex.: 45"
                      onChange={(e) => setAdmin({ ...admin, experiencia_dias: e.target.value.replace(/[^\d]/g, "") })} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs" htmlFor="pa-adm-jornada">Jornada prevista</Label>
                    <Input id="pa-adm-jornada" className="h-10" placeholder="Ex.: 44h semanais, 12x36, escala 6x1"
                      value={admin.jornada_descricao} disabled={encerrada}
                      onChange={(e) => setAdmin({ ...admin, jornada_descricao: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-22h">Trabalha após as 22h</Label>
                    <Select
                      value={pa.trabalho_apos_22h ? "sim" : "nao"}
                      disabled={encerrada || acoes.alterarPrevisto.isPending}
                      onValueChange={(v) =>
                        executar(
                          () => acoes.alterarPrevisto.mutateAsync({ trabalho_apos_22h: v === "sim" }),
                          "Informação de horário alterada",
                        )}
                    >
                      <SelectTrigger id="pa-22h" className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nao">Não</SelectItem>
                        <SelectItem value="sim">Sim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Trabalho após as 22h vale na hora e muda os documentos exigidos. Nada que o candidato já
                  enviou é apagado.
                </p>
              </TabsContent>

              {/* ── Remuneração ──────────────────────────────────────── */}
              <TabsContent value="remuneracao" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-adm-cargo">Cargo</Label>
                    <Select value={admin.cargo_id} disabled={encerrada}
                      onValueChange={(v) => setAdmin({ ...admin, cargo_id: v })}>
                      <SelectTrigger id="pa-adm-cargo" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        <CargoSelectItems carregando={carregandoCargos} erro={erroCargos} total={cargos.length}>
                          {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        </CargoSelectItems>
                      </SelectContent>
                    </Select>
                    <CargoSelectAviso
                      carregando={carregandoCargos}
                      erro={erroCargos}
                      total={cargos.length}
                      onRecarregar={() => void recarregarCargos()}
                      origem="Revisão da pré-admissão"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-adm-salario">Salário</Label>
                    <Input id="pa-adm-salario" className="h-10" value={admin.salario} inputMode="decimal"
                      disabled={encerrada}
                      onChange={(e) => setAdmin({ ...admin, salario: e.target.value.replace(/[^\d.,]/g, "") })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="pa-adm-forma">Forma de pagamento</Label>
                    <Select value={admin.forma_pagamento} disabled={encerrada}
                      onValueChange={(v) => setAdmin({ ...admin, forma_pagamento: v })}>
                      <SelectTrigger id="pa-adm-forma" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {simNao("vale_transporte", "Vale-transporte")}
                  {simNao("adicional_insalubridade", "Adicional de insalubridade")}
                  {simNao("adicional_periculosidade", "Adicional de periculosidade")}
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs" htmlFor="pa-adm-obs">Observações para a contabilidade</Label>
                    <Textarea id="pa-adm-obs" rows={3} value={admin.observacoes} disabled={encerrada}
                      onChange={(e) => setAdmin({ ...admin, observacoes: e.target.value })} />
                  </div>
                </div>
              </TabsContent>

              {/* ── Dependentes ──────────────────────────────────────── */}
              <TabsContent value="dependentes" className="mt-0 space-y-3">
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
              </TabsContent>

              {/* ── Documentos ───────────────────────────────────────── */}
              <TabsContent value="documentos" className="mt-0 space-y-3">
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
              </TabsContent>

              {/* ── Admissão ─────────────────────────────────────────── */}
              <TabsContent value="admissao" className="mt-0 space-y-4">
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
              </TabsContent>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t px-6 py-3">
              <Button variant="outline" onClick={imprimirPacote}>
                <Printer className="h-4 w-4 mr-2" /> Gerar Ficha Para A Contabilidade
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
                <Button disabled={encerrada || salvando} onClick={salvarTudo}>
                  {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar Ficha
                </Button>
              </div>
            </div>
          </Tabs>
        )}
      </DialogContent>
      <PreadmissaoExcluirDialog
        preadmissaoId={excluir ? preadmissaoId : null}
        candidatoNome={data?.preadmissao.candidato_nome ?? ""}
        onOpenChange={setExcluir}
        onExcluida={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

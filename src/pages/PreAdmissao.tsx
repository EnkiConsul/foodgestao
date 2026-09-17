/**
 * Página do candidato (sem login), aberta pelo link enviado pela empresa.
 *
 * Feita para o celular: etapas curtas, retomada de onde parou, envio de fotos
 * dos documentos e uma revisão final antes de enviar. Toda regra (o que pode ser
 * gravado, o que falta, bloqueios) é decidida no servidor; aqui só mostramos o
 * que ele responde — inclusive os erros campo a campo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { EnderecoFields } from "@/components/shared/EnderecoFields";
import { UFS } from "@/lib/endereco";
import { maskCpf } from "@/lib/cpf";
import { maskPhone } from "@/lib/phone";

type Opcao = { value: string; label: string };

type Campo = {
  nome: string;
  rotulo: string;
  tipo?: "text" | "date" | "email" | "tel";
  upper?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "email";
  autoComplete?: string;
  ajuda?: string;
  /** Máscara aplicada na digitação (o valor guardado segue o padrão do sistema). */
  mask?: "cpf" | "data" | "telefone";
  /** Campo em lista: o candidato escolhe, não digita. */
  opcoes?: Opcao[];
  /** Só o gestor pode mudar; o candidato pede correção. */
  somenteLeitura?: boolean;
};

const RACA_COR: Opcao[] = [
  { value: "branca", label: "Branca" },
  { value: "preta", label: "Preta" },
  { value: "parda", label: "Parda" },
  { value: "amarela", label: "Amarela" },
  { value: "indigena", label: "Indígena" },
  { value: "nao_informado", label: "Prefiro não informar" },
];

const ETAPAS: Array<{ titulo: string; ajuda: string; campos: Campo[]; endereco?: boolean }> = [
  {
    titulo: "Seus Dados",
    ajuda: "Escreva como está no seu documento.",
    campos: [
      { nome: "nome", rotulo: "Nome completo", upper: true, autoComplete: "name", somenteLeitura: true },
      { nome: "cpf", rotulo: "CPF", inputMode: "numeric", mask: "cpf", somenteLeitura: true },
      {
        nome: "nome_social",
        rotulo: "Como prefere ser chamado(a)",
        upper: true,
        ajuda: "Opcional. É o nome que usamos no dia a dia.",
      },
      { nome: "data_nascimento", rotulo: "Data de nascimento", mask: "data", inputMode: "numeric", ajuda: "dd/mm/aaaa" },
      { nome: "nome_mae", rotulo: "Nome da mãe", upper: true },
      { nome: "nome_pai", rotulo: "Nome do pai (se tiver)", upper: true },
      { nome: "nacionalidade", rotulo: "Nacionalidade", upper: true, ajuda: "Ex.: BRASILEIRA." },
      { nome: "naturalidade", rotulo: "Cidade onde nasceu", upper: true },
      { nome: "naturalidade_uf", rotulo: "Estado onde nasceu", opcoes: UFS.map((uf) => ({ value: uf, label: uf })) },
      { nome: "raca_cor", rotulo: "Raça / cor", opcoes: RACA_COR },
    ],
  },
  {
    titulo: "Contato",
    ajuda: "Usamos para falar com você sobre a admissão.",
    campos: [
      {
        nome: "telefone",
        rotulo: "Telefone com DDD",
        tipo: "tel",
        inputMode: "tel",
        autoComplete: "tel",
        mask: "telefone",
      },
      { nome: "email", rotulo: "E-mail", tipo: "email", inputMode: "email", autoComplete: "email" },
    ],
  },
  {
    titulo: "Endereço",
    ajuda: "Comece pelo CEP: o resto do endereço vem preenchido.",
    campos: [],
    endereco: true,
  },
  {
    titulo: "Documentos E Registros",
    ajuda: "Se não souber algum número, deixe em branco.",
    campos: [
      { nome: "rg_numero", rotulo: "RG", inputMode: "numeric" },
      { nome: "rg_orgao", rotulo: "Órgão emissor do RG", upper: true },
      { nome: "rg_uf", rotulo: "UF do RG", opcoes: UFS.map((uf) => ({ value: uf, label: uf })) },
      { nome: "pis", rotulo: "PIS / NIS", inputMode: "numeric" },
      { nome: "ctps_numero", rotulo: "Carteira de trabalho", inputMode: "numeric" },
      { nome: "ctps_serie", rotulo: "Série da carteira", inputMode: "numeric" },
      { nome: "titulo_eleitor", rotulo: "Título de eleitor", inputMode: "numeric" },
      { nome: "reservista", rotulo: "Certificado de reservista", inputMode: "numeric" },
    ],
  },
];

/** Data digitada (dd/mm/aaaa) ↔ data guardada (AAAA-MM-DD). */
function isoParaBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function mascararData(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function brParaIso(texto: string): string {
  const d = texto.replace(/\D/g, "");
  if (d.length !== 8) return "";
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}

const SEXO = [
  { value: "feminino", label: "Feminino" },
  { value: "masculino", label: "Masculino" },
  { value: "nao_informado", label: "Prefiro não informar" },
];

const ESTADO_CIVIL = [
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
  { value: "uniao_estavel", label: "União estável" },
];

const INSTRUCAO = [
  { value: "fundamental_incompleto", label: "Fundamental incompleto" },
  { value: "fundamental_completo", label: "Fundamental completo" },
  { value: "medio_incompleto", label: "Médio incompleto" },
  { value: "medio_completo", label: "Médio completo" },
  { value: "superior_incompleto", label: "Superior incompleto" },
  { value: "superior_completo", label: "Superior completo" },
];

/**
 * Parentescos aceitos. Avô e avó entram porque o Sesc aceita esse grau: eles
 * nunca contam como dependente de imposto (o servidor decide o que cobrar).
 */
const PARENTESCO = [
  { value: "filho", label: "Filho(a)" },
  { value: "enteado", label: "Enteado(a)" },
  { value: "conjuge", label: "Cônjuge / companheiro(a)" },
  { value: "pai", label: "Pai" },
  { value: "mae", label: "Mãe" },
  { value: "avo", label: "Avô" },
  { value: "ava", label: "Avó" },
  { value: "menor_guarda", label: "Menor sob guarda" },
];

const ROTULO_PARENTESCO = (v: string) =>
  PARENTESCO.find((p) => p.value === v)?.label ?? (v ? v.replace(/_/g, " ") : "Não informado");

interface Pessoa {
  id?: string;
  nome: string;
  parentesco: string;
  data_nascimento: string;
  cpf: string;
  rg: string;
  finalidade_dependente: boolean;
  finalidade_sesc: boolean;
}

interface ChecklistItem {
  key: string;
  codigo: string;
  titulo: string;
  pessoa_id?: string | null;
  pessoa_nome?: string | null;
  obrigatorio: boolean;
}

interface DocumentoEnviado {
  id: string;
  requisito_codigo: string;
  pessoa_id: string | null;
  file_name: string;
  status: string;
  motivo_recusa?: string | null;
  /** 1 = frente, 2 = verso, e assim por diante. */
  parte?: number | null;
  parte_rotulo?: string | null;
}

/** Nome amigável da parte do documento (frente, verso, foto extra). */
function rotuloParte(parte: number, rotulo?: string | null): string {
  if (rotulo && rotulo.trim()) return rotulo.trim();
  if (parte === 1) return "Frente";
  if (parte === 2) return "Verso";
  return `Foto ${parte}`;
}

interface Estado {
  candidato_nome: string;
  /** CPF informado pela empresa no convite: aparece, mas não pode ser mudado. */
  cpf_bloqueado?: string | null;
  cargo_previsto: string | null;
  unidade_prevista: string | null;
  status: string;
  versao?: number;
  editavel: boolean;
  correcao_motivo: string | null;
  dados: Record<string, unknown>;
  pessoas: Array<Record<string, unknown>>;
  documentos: DocumentoEnviado[];
  checklist: ChecklistItem[];
  pendencias: string[];
  /** O que a empresa exige, dispensa ou nem pede em cada campo. */
  regras_campos?: Record<string, "obrigatorio" | "opcional" | "nao_pedir"> | null;
  /** Graus de parentesco aceitos pela empresa (nulo = todos). */
  parentescos_permitidos?: string[] | null;
}

/** Campos que a ficha sempre pede quando a empresa não muda a regra. */
const OBRIGATORIOS_PADRAO = new Set([
  "nome", "cpf", "data_nascimento", "email", "estado_civil", "nome_mae",
  "grau_instrucao", "telefone", "cep", "endereco", "cidade", "uf",
]);

/** Erro do servidor com o detalhamento por campo, quando houver. */
class ErroServidor extends Error {
  /** Motivo técnico devolvido pela rotina (ex.: "versao_alterada"). */
  motivo: string;
  erros: Record<string, string>;
  camposFaltando: string[];
  documentosFaltando: string[];
  constructor(mensagem: string, corpo: Record<string, unknown> | null) {
    super(mensagem);
    this.motivo = String(corpo?.motivo ?? "");
    this.erros = (corpo?.erros as Record<string, string>) ?? {};
    this.camposFaltando = (corpo?.campos_faltando as string[]) ?? [];
    this.documentosFaltando = (corpo?.documentos_faltando as string[]) ?? [];
  }
}

async function chamar<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // A rotina responde com uma frase pronta para a tela; nunca mostramos o
    // texto técnico do invoke.
    let corpo: Record<string, unknown> | null = null;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      corpo = (await ctx.json().catch(() => null)) as Record<string, unknown> | null;
    }
    if (!corpo) corpo = (data as Record<string, unknown> | null) ?? null;
    const mensagem = String(corpo?.error ?? "") || "Não foi possível concluir agora. Tente novamente.";
    throw new ErroServidor(mensagem, corpo);
  }
  const corpo = data as Record<string, unknown> | null;
  if (corpo?.error) throw new ErroServidor(String(corpo.error), corpo);
  return data as T;
}

const lerBase64 = (arquivo: File) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    fr.readAsDataURL(arquivo);
  });

export default function PreAdmissao() {
  const [params] = useSearchParams();
  const t = params.get("t") ?? "";
  const c = params.get("c") ?? "";

  const [estado, setEstado] = useState<Estado | null>(null);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [enviado, setEnviado] = useState(false);
  const [subindo, setSubindo] = useState<string | null>(null);
  /** Erros campo a campo devolvidos pelo servidor. */
  const [erros, setErros] = useState<Record<string, string>>({});
  const [faltando, setFaltando] = useState<string[]>([]);
  const [avisoTopo, setAvisoTopo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const alvo = useRef<(ChecklistItem & { parte: number }) | null>(null);

  const aplicar = useCallback((e: Estado) => {
    setEstado(e);
    const d = e.dados ?? {};
    const texto: Record<string, string> = {};
    Object.entries(d).forEach(([k, v]) => { texto[k] = v == null ? "" : String(v); });
    setForm(texto);
    setPessoas(
      (e.pessoas ?? []).map((p) => ({
        id: String(p.id),
        nome: String(p.nome ?? ""),
        parentesco: String(p.parentesco ?? "").toLocaleLowerCase("pt-BR").replace(/\s+/g, "_"),
        data_nascimento: String(p.data_nascimento ?? ""),
        cpf: String(p.cpf ?? ""),
        rg: String(p.rg ?? ""),
        finalidade_dependente: !!p.finalidade_dependente,
        finalidade_sesc: !!p.finalidade_sesc,
      })),
    );
  }, []);

  useEffect(() => {
    if (!t || !c) { setErroLink("Este link não é válido. Peça um novo link à empresa."); setCarregando(false); return; }
    (async () => {
      try {
        aplicar(await chamar<Estado>("dp-preadmissao-publica", { t, c, action: "ler" }));
      } catch (e) {
        setErroLink((e as Error).message);
      } finally {
        setCarregando(false);
      }
    })();
  }, [t, c, aplicar]);

  const totalEtapas = ETAPAS.length + 3; // + familiares + documentos + revisão
  const progresso = Math.round(((etapa + 1) / totalEtapas) * 100);

  /** Linha em branco recém-incluída não vai ao servidor. */
  const pessoasParaEnviar = () =>
    pessoas.filter((p) => p.id || p.nome.trim() || p.parentesco.trim() || p.data_nascimento.trim());

  const tratarFalha = async (e: unknown) => {
    if (e instanceof ErroServidor) {
      // Ficha alterada em outro dispositivo: nada do que está na tela é
      // descartado — só atualizamos o número da versão e avisamos, para que a
      // pessoa confira e salve de novo.
      if (e.motivo === "versao_alterada") {
        try {
          const atual = await chamar<Estado>("dp-preadmissao-publica", { t, c, action: "ler" });
          setEstado(atual);
        } catch (_) {
          // sem rede: o aviso abaixo já orienta a recarregar
        }
      }
      setErros(e.erros);
      setFaltando(e.camposFaltando);
      setAvisoTopo(e.message);
      toast.error(e.message);
      return;
    }
    setAvisoTopo((e as Error).message);
    toast.error((e as Error).message);
  };

  const salvar = async (avancar: boolean) => {
    setSalvando(true);
    try {
      const novo = await chamar<Estado>("dp-preadmissao-publica", {
        t, c, action: "salvar", dados: form, pessoas: pessoasParaEnviar(), versao: estado?.versao,
      });
      aplicar(novo);
      setErros({}); setFaltando([]); setAvisoTopo(null);
      if (avancar) setEtapa((n) => Math.min(n + 1, totalEtapas - 1));
      else toast.success("Dados guardados");
      return true;
    } catch (e) {
      await tratarFalha(e);
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const enviar = async () => {
    setSalvando(true);
    try {
      const novo = await chamar<Estado>("dp-preadmissao-publica", {
        t, c, action: "salvar", dados: form, pessoas: pessoasParaEnviar(), versao: estado?.versao,
      });
      aplicar(novo);
      await chamar<{ mensagem: string }>("dp-preadmissao-publica", { t, c, action: "enviar", versao: novo.versao });
      setEnviado(true);
    } catch (e) {
      await tratarFalha(e);
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Nome e CPF vêm conferidos pela empresa. Se estiverem errados, o candidato
   * registra o aviso e quem decide é o gestor — nada muda aqui.
   */
  const pedirCorrecao = async (rotulo: string) => {
    const texto = window.prompt(`O que está errado em "${rotulo}"? Escreva o dado correto.`);
    if (!texto || !texto.trim()) return;
    try {
      await chamar<{ success: boolean }>("dp-preadmissao-publica", {
        t, c, action: "pedir_correcao", campo: rotulo, mensagem: texto.trim().slice(0, 500),
      });
      toast.success("Aviso enviado à empresa.");
    } catch (e) {
      void tratarFalha(e);
    }
  };

  /** Cada documento aceita mais de uma foto (frente, verso e extras). */
  const escolherArquivo = (item: ChecklistItem, parte: number) => {
    alvo.current = { ...item, parte };
    fileRef.current?.click();
  };

  const enviarArquivo = async (arquivo: File) => {
    const item = alvo.current;
    if (!item) return;
    const parte = Math.min(Math.max(item.parte ?? 1, 1), 10);
    setSubindo(`${item.key}:${parte}`);
    try {
      const base64 = await lerBase64(arquivo);
      await chamar<{ success: boolean }>("dp-preadmissao-arquivo", {
        action: "upload",
        t, c,
        requisito_codigo: item.codigo,
        pessoa_id: item.pessoa_id ?? null,
        file_name: arquivo.name,
        content_base64: base64,
        parte,
        parte_rotulo: rotuloParte(parte),
      });
      aplicar(await chamar<Estado>("dp-preadmissao-publica", { t, c, action: "ler" }));
      toast.success(`${rotuloParte(parte)} enviada`);
    } catch (e) {
      void tratarFalha(e);
    } finally {
      setSubindo(null);
      alvo.current = null;
    }
  };

  /** O candidato revê o próprio arquivo por link temporário do convite. */
  const verArquivo = async (documentoId: string) => {
    try {
      const r = await chamar<{ url: string }>("dp-preadmissao-arquivo", {
        action: "url_candidato",
        t, c,
        documento_id: documentoId,
      });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      void tratarFalha(e);
    }
  };

  /** Todas as fotos enviadas de cada documento, em ordem de parte. */
  const documentoPorChave = useMemo(() => {
    const m = new Map<string, DocumentoEnviado[]>();
    (estado?.documentos ?? []).forEach((d) => {
      const chave = `${d.requisito_codigo}:${d.pessoa_id ?? ""}`;
      m.set(chave, [...(m.get(chave) ?? []), d]);
    });
    for (const lista of m.values()) lista.sort((a, b) => (a.parte ?? 1) - (b.parte ?? 1));
    return m;
  }, [estado?.documentos]);

  if (carregando) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-sm text-muted-foreground">
        <div className="text-center" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Abrindo seu formulário…
        </div>
      </div>
    );
  }

  if (erroLink) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center space-y-2">
            <h1 className="text-lg font-semibold">Link Indisponível</h1>
            <p className="text-sm text-muted-foreground">{erroLink}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (enviado || (estado && !estado.editavel)) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-600" />
            <h1 className="text-lg font-semibold">Recebemos Seus Dados</h1>
            <p className="text-sm text-muted-foreground">
              A empresa vai analisar suas informações e falar com você. Se algo precisar de ajuste, você recebe um novo
              aviso pelo WhatsApp.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const etapaAtual = ETAPAS[etapa];
  const ehFamiliares = etapa === ETAPAS.length;
  const ehDocumentos = etapa === ETAPAS.length + 1;
  const ehRevisao = etapa === ETAPAS.length + 2;

  const CAMPOS_ENDERECO: Campo[] = [
    { nome: "cep", rotulo: "CEP" },
    { nome: "endereco", rotulo: "Rua" },
    { nome: "numero", rotulo: "Número" },
    { nome: "complemento", rotulo: "Complemento" },
    { nome: "bairro", rotulo: "Bairro" },
    { nome: "cidade", rotulo: "Cidade" },
    { nome: "uf", rotulo: "UF" },
  ];
  /**
   * Exigência do campo segundo as regras da empresa. A conferência final é
   * sempre do servidor: aqui só mostramos e orientamos.
   */
  const regrasCampos = estado?.regras_campos ?? {};
  const exigenciaCampo = (nome: string): "obrigatorio" | "opcional" | "nao_pedir" => {
    const r = regrasCampos[nome];
    if (r) return r;
    return OBRIGATORIOS_PADRAO.has(nome) ? "obrigatorio" : "opcional";
  };
  const campoVisivel = (c: Campo) => exigenciaCampo(c.nome) !== "nao_pedir";
  const parentescosPermitidos = estado?.parentescos_permitidos ?? null;
  const parentescosDaLista = parentescosPermitidos
    ? PARENTESCO.filter((p) => parentescosPermitidos.includes(p.value))
    : PARENTESCO;
  const camposDaRevisao = ETAPAS.flatMap((e) => (e.endereco ? CAMPOS_ENDERECO : e.campos)).filter(campoVisivel);

  /** Na revisão o valor aparece como a pessoa está acostumada a ver. */
  const valorLegivel = (campo: Campo) => {
    const bruto = form[campo.nome]?.trim() ?? "";
    if (!bruto) return "—";
    if (campo.mask === "cpf") return maskCpf(bruto);
    if (campo.mask === "telefone") return maskPhone(bruto);
    if (campo.mask === "data") return isoParaBr(bruto);
    if (campo.opcoes) return campo.opcoes.find((o) => o.value === bruto)?.label ?? bruto;
    return bruto;
  };
  const pendentesObrigatorios = (estado?.checklist ?? []).filter(
    (i) => i.obrigatorio && !documentoPorChave.has(`${i.codigo}:${i.pessoa_id ?? ""}`),
  );

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      <Helmet>
        <title>Ficha de Admissão | 360°FOOD</title>
        <meta name="description" content="Preencha seus dados e envie seus documentos para iniciar sua admissão." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) enviarArquivo(f);
        }}
      />

      <header className="bg-background border-b px-4 py-4">
        <h1 className="text-base font-semibold">Ficha de Admissão</h1>
        <p className="text-xs text-muted-foreground">
          Olá, {estado?.candidato_nome}. {estado?.cargo_previsto ? `Vaga: ${estado.cargo_previsto}. ` : ""}
          Leva poucos minutos e você pode voltar depois pelo mesmo link.
        </p>
        <Progress value={progresso} className="mt-3 h-1.5" aria-label="Progresso do preenchimento" />
      </header>

      {estado?.correcao_motivo && (
        <div className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold">A empresa pediu um ajuste</p>
          <p className="text-muted-foreground">{estado.correcao_motivo}</p>
        </div>
      )}

      {avisoTopo && (
        <div
          className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
          role="alert"
          aria-live="assertive"
        >
          <p className="font-semibold">{avisoTopo}</p>
          {!!faltando.length && (
            <ul className="list-disc pl-5 text-muted-foreground mt-1">
              {faltando.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
        </div>
      )}

      <main className="p-4 space-y-4">
        {etapaAtual && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <h2 className="font-semibold">{etapaAtual.titulo}</h2>
                <p className="text-xs text-muted-foreground">{etapaAtual.ajuda}</p>
              </div>
              {etapa === 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {exigenciaCampo("sexo") !== "nao_pedir" && (
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="sexo">
                      Sexo{exigenciaCampo("sexo") === "obrigatorio" && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select value={form.sexo ?? ""} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                      <SelectTrigger id="sexo" className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {SEXO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {erros.sexo && <p className="text-xs text-destructive">{erros.sexo}</p>}
                  </div>
                  )}
                  {exigenciaCampo("estado_civil") !== "nao_pedir" && (
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="estado_civil">
                      Estado civil
                      {exigenciaCampo("estado_civil") === "obrigatorio" && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select value={form.estado_civil ?? ""} onValueChange={(v) => setForm({ ...form, estado_civil: v })}>
                      <SelectTrigger id="estado_civil" className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {ESTADO_CIVIL.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {erros.estado_civil && <p className="text-xs text-destructive">{erros.estado_civil}</p>}
                  </div>
                  )}
                  {exigenciaCampo("grau_instrucao") !== "nao_pedir" && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs" htmlFor="grau_instrucao">
                      Escolaridade
                      {exigenciaCampo("grau_instrucao") === "obrigatorio" && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select value={form.grau_instrucao ?? ""} onValueChange={(v) => setForm({ ...form, grau_instrucao: v })}>
                      <SelectTrigger id="grau_instrucao" className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {INSTRUCAO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  )}
                </div>
              )}
              {etapaAtual.endereco ? (
                <EnderecoFields
                  idPrefix="campo"
                  upper
                  erros={{
                    cep: erros.cep ?? "",
                    logradouro: erros.endereco ?? "",
                    bairro: erros.bairro ?? "",
                    cidade: erros.cidade ?? "",
                    uf: erros.uf ?? "",
                  }}
                  valor={{
                    cep: form.cep ?? "",
                    logradouro: form.endereco ?? "",
                    numero: form.numero ?? "",
                    complemento: form.complemento ?? "",
                    bairro: form.bairro ?? "",
                    cidade: form.cidade ?? "",
                    uf: form.uf ?? "",
                  }}
                  onChange={(patch) =>
                    setForm((f) => ({
                      ...f,
                      ...(patch.cep !== undefined ? { cep: String(patch.cep ?? "") } : {}),
                      ...(patch.logradouro !== undefined ? { endereco: String(patch.logradouro ?? "") } : {}),
                      ...(patch.numero !== undefined ? { numero: String(patch.numero ?? "") } : {}),
                      ...(patch.complemento !== undefined ? { complemento: String(patch.complemento ?? "") } : {}),
                      ...(patch.bairro !== undefined ? { bairro: String(patch.bairro ?? "") } : {}),
                      ...(patch.cidade !== undefined ? { cidade: String(patch.cidade ?? "") } : {}),
                      ...(patch.uf !== undefined ? { uf: String(patch.uf ?? "") } : {}),
                    }))
                  }
                />
              ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {etapaAtual.campos.filter(campoVisivel).map((campo) => {
                  // Nome e CPF conferidos pela empresa: o candidato vê, aponta
                  // erro e a empresa decide — nunca altera por conta própria.
                  const travado = !!campo.somenteLeitura;
                  const valor = form[campo.nome] ?? "";
                  const exibido = campo.mask === "cpf"
                    ? maskCpf(valor)
                    : campo.mask === "data"
                    ? mascararData(isoParaBr(valor))
                    : campo.mask === "telefone"
                    ? maskPhone(valor)
                    : valor;
                  const digitar = (bruto: string) => {
                    if (travado) return;
                    if (campo.mask === "data") {
                      const texto = mascararData(bruto);
                      setForm((f) => ({ ...f, [campo.nome]: texto.length === 10 ? brParaIso(texto) : texto }));
                      return;
                    }
                    const limpo = campo.mask === "cpf"
                      ? bruto.replace(/\D/g, "").slice(0, 11)
                      : campo.mask === "telefone"
                      ? bruto.replace(/\D/g, "").slice(0, 11)
                      : campo.upper
                      ? bruto.toLocaleUpperCase("pt-BR")
                      : bruto;
                    setForm((f) => ({ ...f, [campo.nome]: limpo }));
                  };
                  return (
                  <div key={campo.nome} className="space-y-1">
                    <Label className="text-xs" htmlFor={`campo-${campo.nome}`}>
                      {campo.rotulo}
                      {exigenciaCampo(campo.nome) === "obrigatorio" && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    {campo.opcoes ? (
                      <Select
                        value={valor}
                        onValueChange={(v) => setForm((f) => ({ ...f, [campo.nome]: v }))}
                      >
                        <SelectTrigger id={`campo-${campo.nome}`} className="h-11">
                          <SelectValue placeholder="Escolher" />
                        </SelectTrigger>
                        <SelectContent>
                          {campo.opcoes.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                    <Input
                      id={`campo-${campo.nome}`}
                      className="h-11"
                      readOnly={travado}
                      aria-readonly={travado || undefined}
                      type={campo.mask ? "text" : campo.tipo ?? "text"}
                      inputMode={campo.inputMode}
                      autoComplete={campo.autoComplete}
                      autoCapitalize={campo.upper ? "characters" : campo.tipo === "email" ? "none" : "sentences"}
                      autoCorrect={campo.upper || campo.tipo === "email" ? "off" : undefined}
                      spellCheck={campo.upper || campo.tipo === "email" ? false : undefined}
                      aria-invalid={!!erros[campo.nome]}
                      aria-describedby={
                        erros[campo.nome] ? `erro-${campo.nome}` : campo.ajuda ? `ajuda-${campo.nome}` : undefined
                      }
                      value={exibido}
                      onChange={(e) => digitar(e.target.value)}
                    />
                    )}
                    {travado ? (
                      <div id={`ajuda-${campo.nome}`} className="text-xs text-muted-foreground">
                        Esta informação foi cadastrada pela empresa.{" "}
                        <button
                          type="button"
                          className="text-primary underline"
                          onClick={() => pedirCorrecao(campo.rotulo)}
                        >
                          Está errado? Avise a empresa
                        </button>
                      </div>
                    ) : campo.ajuda && !erros[campo.nome] ? (
                      <p id={`ajuda-${campo.nome}`} className="text-xs text-muted-foreground">{campo.ajuda}</p>
                    ) : null}
                    {erros[campo.nome] && (
                      <p id={`erro-${campo.nome}`} className="text-xs text-destructive">{erros[campo.nome]}</p>
                    )}
                  </div>
                  );
                })}
              </div>
              )}
            </CardContent>
          </Card>
        )}

        {ehFamiliares && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <h2 className="font-semibold">Familiares</h2>
                <p className="text-xs text-muted-foreground">
                  Inclua quem você quer declarar como dependente ou cadastrar no Sesc (aqui entram também avô e avó).
                  Se não tiver ninguém, siga adiante.
                </p>
              </div>
              {pessoas.map((p, i) => (
                <div key={p.id ?? `nova-${i}`} className="rounded-lg border p-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor={`fam-nome-${i}`}>Nome completo</Label>
                      <Input id={`fam-nome-${i}`} className="h-11" value={p.nome} autoCapitalize="characters"
                        autoCorrect="off" spellCheck={false}
                        onChange={(e) => {
                          const v = e.target.value.toLocaleUpperCase("pt-BR");
                          setPessoas(pessoas.map((x, j) => (j === i ? { ...x, nome: v } : x)));
                        }} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor={`fam-par-${i}`}>Parentesco</Label>
                      <Select value={p.parentesco}
                        onValueChange={(v) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, parentesco: v } : x)))}>
                        <SelectTrigger id={`fam-par-${i}`} className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                        <SelectContent>
                          {parentescosDaLista.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor={`fam-nasc-${i}`}>Data de nascimento</Label>
                      <Input id={`fam-nasc-${i}`} className="h-11" type="date" value={p.data_nascimento}
                        onChange={(e) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, data_nascimento: e.target.value } : x)))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor={`fam-cpf-${i}`}>CPF (se tiver)</Label>
                      <Input id={`fam-cpf-${i}`} className="h-11" value={p.cpf} inputMode="numeric"
                        onChange={(e) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, cpf: e.target.value } : x)))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor={`fam-rg-${i}`}>RG (se tiver)</Label>
                      <Input id={`fam-rg-${i}`} className="h-11" value={p.rg} inputMode="numeric"
                        onChange={(e) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, rg: e.target.value } : x)))} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <Label className="text-sm" htmlFor={`fam-dep-${i}`}>Declarar como dependente</Label>
                    <Switch id={`fam-dep-${i}`} checked={p.finalidade_dependente}
                      onCheckedChange={(v) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, finalidade_dependente: v } : x)))} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <Label className="text-sm" htmlFor={`fam-sesc-${i}`}>Cadastrar no Sesc</Label>
                    <Switch id={`fam-sesc-${i}`} checked={p.finalidade_sesc}
                      onCheckedChange={(v) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, finalidade_sesc: v } : x)))} />
                  </div>
                  <Button variant="ghost" className="text-destructive"
                    onClick={() => setPessoas(pessoas.filter((_, j) => j !== i))}>
                    Retirar Da Lista
                  </Button>
                </div>
              ))}
              <Button variant="outline" className="w-full h-11"
                onClick={() => setPessoas([...pessoas, {
                  nome: "", parentesco: "", data_nascimento: "", cpf: "", rg: "",
                  finalidade_dependente: true, finalidade_sesc: false,
                }])}>
                Incluir Familiar
              </Button>
            </CardContent>
          </Card>
        )}

        {ehDocumentos && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <h2 className="font-semibold">Documentos</h2>
                <p className="text-xs text-muted-foreground">
                  Tire uma foto de cada documento pedido. Dá para enviar de novo se a foto não ficar boa.
                </p>
              </div>
              {!estado?.checklist.length && (
                <p className="text-sm text-muted-foreground">Nenhum documento pedido para esta ficha.</p>
              )}
              {(estado?.checklist ?? []).map((item) => {
                const chave = `${item.codigo}:${item.pessoa_id ?? ""}`;
                const fotos = documentoPorChave.get(chave) ?? [];
                const proximaParte = Math.min((fotos.reduce((max, d) => Math.max(max, d.parte ?? 1), 0)) + 1, 10);
                return (
                  <div key={item.key} className="rounded-lg border p-3 space-y-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.pessoa_nome ? item.pessoa_nome : "Seu documento"}
                        {item.obrigatorio ? " · obrigatório" : " · opcional"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Se o documento tiver frente e verso, envie uma foto de cada lado.
                      </p>
                    </div>

                    {fotos.map((doc) => {
                      const parte = doc.parte ?? 1;
                      const recusado = doc.status === "recusado";
                      return (
                        <div key={doc.id} className="rounded-md bg-muted/40 p-2 flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium">{rotuloParte(parte, doc.parte_rotulo)}</p>
                            <button
                              type="button"
                              className="text-xs text-primary underline"
                              onClick={() => verArquivo(doc.id)}
                            >
                              Ver esta foto
                            </button>
                            {recusado && (
                              <p className="text-xs text-destructive">
                                A empresa não aceitou{doc.motivo_recusa ? `: ${doc.motivo_recusa}` : ""}. Envie outra foto.
                              </p>
                            )}
                          </div>
                          {recusado
                            ? <Badge variant="destructive">Reenviar</Badge>
                            : (
                              <Badge variant="outline" className="text-emerald-600">
                                {doc.status === "aprovado" ? "Aprovado" : "Enviado"}
                              </Badge>
                            )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10"
                            aria-label={`Substituir ${rotuloParte(parte, doc.parte_rotulo)} de ${item.titulo}`}
                            disabled={subindo === `${item.key}:${parte}`}
                            onClick={() => escolherArquivo(item, parte)}
                          >
                            {subindo === `${item.key}:${parte}`
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Camera className="h-4 w-4" />}
                          </Button>
                        </div>
                      );
                    })}

                    <Button
                      size="sm"
                      variant={fotos.length ? "outline" : "default"}
                      className="h-10 w-full"
                      aria-label={`Enviar ${rotuloParte(proximaParte)} de ${item.titulo}`}
                      disabled={subindo === `${item.key}:${proximaParte}` || fotos.length >= 10}
                      onClick={() => escolherArquivo(item, proximaParte)}
                    >
                      {subindo === `${item.key}:${proximaParte}`
                        ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        : <Camera className="h-4 w-4 mr-2" />}
                      {fotos.length ? `Enviar ${rotuloParte(proximaParte)}` : "Enviar Frente"}
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {ehRevisao && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h2 className="font-semibold">Confira Antes De Enviar</h2>
                <p className="text-xs text-muted-foreground">
                  Depois de enviar você não consegue mais alterar. Volte se algo estiver diferente do seu documento.
                </p>
              </div>

              <section>
                <h3 className="text-sm font-semibold mb-1">Seus dados</h3>
                <dl className="text-sm">
                  {camposDaRevisao.map((campo) => (
                    <div key={campo.nome} className="flex justify-between gap-3 border-b border-dashed py-1">
                      <dt className="text-muted-foreground">{campo.rotulo}</dt>
                      <dd className="text-right">{valorLegivel(campo)}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-1">Familiares</h3>
                {!pessoasParaEnviar().length ? (
                  <p className="text-sm text-muted-foreground">Nenhum familiar informado.</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {pessoasParaEnviar().map((p, i) => (
                      <li key={p.id ?? `rev-${i}`} className="border-b border-dashed py-1">
                        {p.nome || "Sem nome"} — {ROTULO_PARENTESCO(p.parentesco)}
                        {p.finalidade_dependente ? " · dependente" : ""}
                        {p.finalidade_sesc ? " · Sesc" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-1">Documentos</h3>
                {!pendentesObrigatorios.length ? (
                  <p className="text-sm text-emerald-600">Todos os documentos obrigatórios foram enviados.</p>
                ) : (
                  <ul className="list-disc pl-5 text-sm text-destructive">
                    {pendentesObrigatorios.map((i) => (
                      <li key={i.key}>{i.titulo}{i.pessoa_nome ? ` — ${i.pessoa_nome}` : ""}</li>
                    ))}
                  </ul>
                )}
              </section>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t bg-background p-3 flex gap-2">
        <Button variant="outline" className="h-12" disabled={etapa === 0 || salvando}
          aria-label="Voltar uma etapa"
          onClick={() => setEtapa((n) => Math.max(0, n - 1))}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" className="h-12 flex-1" disabled={salvando} onClick={() => salvar(false)}>
          Guardar
        </Button>
        {ehRevisao ? (
          <Button className="h-12 flex-1" disabled={salvando} onClick={enviar}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        ) : (
          <Button className="h-12 flex-1" disabled={salvando} onClick={() => salvar(true)}>
            {ehDocumentos ? "Revisar" : "Continuar"} <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </footer>
    </div>
  );
}

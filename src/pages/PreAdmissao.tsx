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

type Campo = {
  nome: string;
  rotulo: string;
  tipo?: "text" | "date" | "email" | "tel";
  upper?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "email";
  autoComplete?: string;
  ajuda?: string;
};

const ETAPAS: Array<{ titulo: string; ajuda: string; campos: Campo[] }> = [
  {
    titulo: "Seus Dados",
    ajuda: "Escreva como está no seu documento.",
    campos: [
      { nome: "nome", rotulo: "Nome completo", upper: true, autoComplete: "name" },
      { nome: "cpf", rotulo: "CPF", inputMode: "numeric", ajuda: "Só os números." },
      { nome: "data_nascimento", rotulo: "Data de nascimento", tipo: "date", autoComplete: "bday" },
      { nome: "nome_mae", rotulo: "Nome da mãe", upper: true },
      { nome: "nome_pai", rotulo: "Nome do pai (se tiver)", upper: true },
    ],
  },
  {
    titulo: "Contato",
    ajuda: "Usamos para falar com você sobre a admissão.",
    campos: [
      { nome: "telefone", rotulo: "Telefone com DDD", tipo: "tel", inputMode: "tel", autoComplete: "tel" },
      { nome: "email", rotulo: "E-mail", tipo: "email", inputMode: "email", autoComplete: "email" },
    ],
  },
  {
    titulo: "Endereço",
    ajuda: "Onde você mora hoje.",
    campos: [
      { nome: "cep", rotulo: "CEP", inputMode: "numeric", autoComplete: "postal-code" },
      { nome: "endereco", rotulo: "Rua", upper: true, autoComplete: "address-line1" },
      { nome: "numero", rotulo: "Número", inputMode: "numeric" },
      { nome: "complemento", rotulo: "Complemento", upper: true },
      { nome: "bairro", rotulo: "Bairro", upper: true },
      { nome: "cidade", rotulo: "Cidade", upper: true },
      { nome: "uf", rotulo: "UF", upper: true },
    ],
  },
  {
    titulo: "Documentos E Registros",
    ajuda: "Se não souber algum número, deixe em branco.",
    campos: [
      { nome: "rg_numero", rotulo: "RG", inputMode: "numeric" },
      { nome: "rg_orgao", rotulo: "Órgão emissor do RG", upper: true },
      { nome: "rg_uf", rotulo: "UF do RG", upper: true },
      { nome: "pis", rotulo: "PIS / NIS", inputMode: "numeric" },
      { nome: "ctps_numero", rotulo: "Carteira de trabalho", inputMode: "numeric" },
      { nome: "ctps_serie", rotulo: "Série da carteira", inputMode: "numeric" },
      { nome: "titulo_eleitor", rotulo: "Título de eleitor", inputMode: "numeric" },
      { nome: "reservista", rotulo: "Certificado de reservista", inputMode: "numeric" },
    ],
  },
];

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
}

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
  const alvo = useRef<ChecklistItem | null>(null);

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

  const escolherArquivo = (item: ChecklistItem) => {
    alvo.current = item;
    fileRef.current?.click();
  };

  const enviarArquivo = async (arquivo: File) => {
    const item = alvo.current;
    if (!item) return;
    setSubindo(item.key);
    try {
      const base64 = await lerBase64(arquivo);
      await chamar<{ success: boolean }>("dp-preadmissao-arquivo", {
        action: "upload",
        t, c,
        requisito_codigo: item.codigo,
        pessoa_id: item.pessoa_id ?? null,
        file_name: arquivo.name,
        content_base64: base64,
      });
      aplicar(await chamar<Estado>("dp-preadmissao-publica", { t, c, action: "ler" }));
      toast.success("Documento enviado");
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

  const documentoPorChave = useMemo(() => {
    const m = new Map<string, DocumentoEnviado>();
    (estado?.documentos ?? []).forEach((d) => m.set(`${d.requisito_codigo}:${d.pessoa_id ?? ""}`, d));
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

  const camposDaRevisao = ETAPAS.flatMap((e) => e.campos);
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
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="sexo">Sexo</Label>
                    <Select value={form.sexo ?? ""} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                      <SelectTrigger id="sexo" className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {SEXO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {erros.sexo && <p className="text-xs text-destructive">{erros.sexo}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="estado_civil">Estado civil</Label>
                    <Select value={form.estado_civil ?? ""} onValueChange={(v) => setForm({ ...form, estado_civil: v })}>
                      <SelectTrigger id="estado_civil" className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {ESTADO_CIVIL.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {erros.estado_civil && <p className="text-xs text-destructive">{erros.estado_civil}</p>}
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs" htmlFor="grau_instrucao">Escolaridade</Label>
                    <Select value={form.grau_instrucao ?? ""} onValueChange={(v) => setForm({ ...form, grau_instrucao: v })}>
                      <SelectTrigger id="grau_instrucao" className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {INSTRUCAO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {etapaAtual.campos.map((campo) => {
                  // CPF vindo do convite: mostramos travado, com explicação.
                  const travado = campo.nome === "cpf" && !!estado?.cpf_bloqueado;
                  return (
                  <div key={campo.nome} className="space-y-1">
                    <Label className="text-xs" htmlFor={`campo-${campo.nome}`}>{campo.rotulo}</Label>
                    <Input
                      id={`campo-${campo.nome}`}
                      className="h-11"
                      readOnly={travado}
                      aria-readonly={travado || undefined}
                      type={campo.tipo ?? "text"}
                      inputMode={campo.inputMode}
                      autoComplete={campo.autoComplete}
                      autoCapitalize={campo.upper ? "characters" : campo.tipo === "email" ? "none" : "sentences"}
                      autoCorrect={campo.upper || campo.tipo === "email" ? "off" : undefined}
                      spellCheck={campo.upper || campo.tipo === "email" ? false : undefined}
                      aria-invalid={!!erros[campo.nome]}
                      aria-describedby={
                        erros[campo.nome] ? `erro-${campo.nome}` : campo.ajuda ? `ajuda-${campo.nome}` : undefined
                      }
                      value={form[campo.nome] ?? ""}
                      onChange={(e) => {
                        if (travado) return;
                        setForm({
                          ...form,
                          [campo.nome]: campo.upper ? e.target.value.toLocaleUpperCase("pt-BR") : e.target.value,
                        });
                      }}
                    />
                    {travado ? (
                      <p id={`ajuda-${campo.nome}`} className="text-xs text-muted-foreground">
                        A empresa já informou seu CPF. Se estiver errado, avise a empresa.
                      </p>
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
                          {PARENTESCO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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
                const doc = documentoPorChave.get(chave);
                const recusado = doc?.status === "recusado";
                return (
                  <div key={item.key} className="rounded-lg border p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.pessoa_nome ? item.pessoa_nome : "Seu documento"}
                        {item.obrigatorio ? " · obrigatório" : " · opcional"}
                      </p>
                      {doc && (
                        <button
                          type="button"
                          className="text-xs text-primary underline mt-1"
                          onClick={() => verArquivo(doc.id)}
                        >
                          Ver o que você enviou
                        </button>
                      )}
                      {recusado && (
                        <p className="text-xs text-destructive mt-1">
                          A empresa não aceitou este arquivo{doc?.motivo_recusa ? `: ${doc.motivo_recusa}` : ""}. Envie
                          uma nova foto.
                        </p>
                      )}
                    </div>
                    {doc && !recusado && (
                      <Badge variant="outline" className="text-emerald-600">
                        {doc.status === "aprovado" ? "Aprovado" : "Enviado"}
                      </Badge>
                    )}
                    {recusado && <Badge variant="destructive">Reenviar</Badge>}
                    <Button
                      size="sm"
                      variant={doc && !recusado ? "outline" : "default"}
                      className="h-10"
                      aria-label={`${doc ? "Enviar novamente" : "Enviar"} ${item.titulo}`}
                      disabled={subindo === item.key}
                      onClick={() => escolherArquivo(item)}
                    >
                      {subindo === item.key
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Camera className="h-4 w-4" />}
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
                      <dd className="text-right">{form[campo.nome]?.trim() || "—"}</dd>
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

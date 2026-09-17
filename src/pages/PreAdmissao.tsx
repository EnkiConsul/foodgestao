/**
 * Página do candidato (sem login), aberta pelo link enviado pela empresa.
 *
 * Feita para o celular: etapas curtas, retomada de onde parou e envio de fotos
 * dos documentos. Toda regra (o que pode ser gravado, o que falta, bloqueios) é
 * decidida no servidor; aqui só mostramos o que ele responde.
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

type Campo = { nome: string; rotulo: string; tipo?: "text" | "date" | "email" | "tel"; upper?: boolean };

const ETAPAS: Array<{ titulo: string; ajuda: string; campos: Campo[] }> = [
  {
    titulo: "Seus Dados",
    ajuda: "Escreva como está no seu documento.",
    campos: [
      { nome: "nome", rotulo: "Nome completo", upper: true },
      { nome: "cpf", rotulo: "CPF" },
      { nome: "data_nascimento", rotulo: "Data de nascimento", tipo: "date" },
      { nome: "nome_mae", rotulo: "Nome da mãe", upper: true },
      { nome: "nome_pai", rotulo: "Nome do pai (se tiver)", upper: true },
    ],
  },
  {
    titulo: "Contato",
    ajuda: "Usamos para falar com você sobre a admissão.",
    campos: [
      { nome: "telefone", rotulo: "Telefone com DDD", tipo: "tel" },
      { nome: "email", rotulo: "E-mail", tipo: "email" },
    ],
  },
  {
    titulo: "Endereço",
    ajuda: "Onde você mora hoje.",
    campos: [
      { nome: "cep", rotulo: "CEP" },
      { nome: "endereco", rotulo: "Rua", upper: true },
      { nome: "numero", rotulo: "Número" },
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
      { nome: "rg_numero", rotulo: "RG" },
      { nome: "rg_orgao", rotulo: "Órgão emissor do RG", upper: true },
      { nome: "rg_uf", rotulo: "UF do RG", upper: true },
      { nome: "pis", rotulo: "PIS / NIS" },
      { nome: "ctps_numero", rotulo: "Carteira de trabalho" },
      { nome: "ctps_serie", rotulo: "Série da carteira" },
      { nome: "titulo_eleitor", rotulo: "Título de eleitor" },
      { nome: "reservista", rotulo: "Certificado de reservista" },
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

const PARENTESCO = [
  { value: "filho", label: "Filho(a)" },
  { value: "enteado", label: "Enteado(a)" },
  { value: "conjuge", label: "Cônjuge / companheiro(a)" },
  { value: "pai", label: "Pai" },
  { value: "mae", label: "Mãe" },
  { value: "menor_guarda", label: "Menor sob guarda" },
];

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

interface Estado {
  candidato_nome: string;
  cargo_previsto: string | null;
  unidade_prevista: string | null;
  status: string;
  editavel: boolean;
  correcao_motivo: string | null;
  dados: Record<string, unknown>;
  pessoas: Array<Record<string, unknown>>;
  documentos: Array<{ id: string; requisito_codigo: string; pessoa_id: string | null; file_name: string; status: string }>;
  checklist: ChecklistItem[];
  pendencias: string[];
}

async function chamar<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // A rotina responde com uma frase pronta para a tela; nunca mostramos o
    // texto técnico do invoke.
    let detalhe = "";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const corpo = await ctx.json().catch(() => null) as { error?: string } | null;
      detalhe = corpo?.error ?? "";
    }
    if (!detalhe) detalhe = ((data as { error?: string } | null)?.error) ?? "";
    throw new Error(detalhe || "Não foi possível concluir agora. Tente novamente.");
  }
  const erro = (data as { error?: string } | null)?.error;
  if (erro) throw new Error(erro);
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
        parentesco: String(p.parentesco ?? ""),
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

  const totalEtapas = ETAPAS.length + 2; // + familiares + documentos
  const progresso = Math.round(((etapa + 1) / totalEtapas) * 100);

  /** Linha em branco recém-incluída não vai ao servidor. */
  const pessoasParaEnviar = () =>
    pessoas.filter((p) => p.id || p.nome.trim() || p.parentesco.trim() || p.data_nascimento.trim());


  const salvar = async (avancar: boolean) => {
    setSalvando(true);
    try {
      const novo = await chamar<Estado>("dp-preadmissao-publica", {
        t, c, action: "salvar", dados: form, pessoas: pessoasParaEnviar(),
      });
      aplicar(novo);
      if (avancar) setEtapa((n) => Math.min(n + 1, totalEtapas - 1));
      else toast.success("Dados guardados");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const enviar = async () => {
    setSalvando(true);
    try {
      await chamar<Estado>("dp-preadmissao-publica", { t, c, action: "salvar", dados: form, pessoas: pessoasParaEnviar() });
      await chamar<{ mensagem: string }>("dp-preadmissao-publica", { t, c, action: "enviar" });
      setEnviado(true);
    } catch (e) {
      toast.error((e as Error).message);
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
      toast.error((e as Error).message);
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
      toast.error((e as Error).message);
    }
  };

  const documentoPorChave = useMemo(() => {
    const m = new Map<string, { id: string; file_name: string; status: string }>();
    (estado?.documentos ?? []).forEach((d) =>
      m.set(`${d.requisito_codigo}:${d.pessoa_id ?? ""}`, { id: d.id, file_name: d.file_name, status: d.status }));
    return m;
  }, [estado?.documentos]);

  const enviadosPorChave = useMemo(() => {
    const m = new Set<string>();
    (estado?.documentos ?? []).forEach((d) => m.add(`${d.requisito_codigo}:${d.pessoa_id ?? ""}`));
    return m;
  }, [estado?.documentos]);

  if (carregando) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-sm text-muted-foreground">
        <div className="text-center">
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
        <Progress value={progresso} className="mt-3 h-1.5" />
      </header>

      {estado?.correcao_motivo && (
        <div className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold">A empresa pediu um ajuste</p>
          <p className="text-muted-foreground">{estado.correcao_motivo}</p>
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
                    <Label className="text-xs">Sexo</Label>
                    <Select value={form.sexo ?? ""} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {SEXO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Estado civil</Label>
                    <Select value={form.estado_civil ?? ""} onValueChange={(v) => setForm({ ...form, estado_civil: v })}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {ESTADO_CIVIL.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Escolaridade</Label>
                    <Select value={form.grau_instrucao ?? ""} onValueChange={(v) => setForm({ ...form, grau_instrucao: v })}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        {INSTRUCAO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {etapaAtual.campos.map((campo) => (
                  <div key={campo.nome} className="space-y-1">
                    <Label className="text-xs">{campo.rotulo}</Label>
                    <Input
                      className="h-11"
                      type={campo.tipo ?? "text"}
                      value={form[campo.nome] ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [campo.nome]: campo.upper ? e.target.value.toLocaleUpperCase("pt-BR") : e.target.value,
                        })}
                    />
                  </div>
                ))}
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
                  Inclua quem você quer declarar como dependente ou cadastrar no Sesc. Se não tiver ninguém, siga
                  adiante.
                </p>
              </div>
              {pessoas.map((p, i) => (
                <div key={p.id ?? `nova-${i}`} className="rounded-lg border p-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome completo</Label>
                      <Input className="h-11" value={p.nome}
                        onChange={(e) => {
                          const v = e.target.value.toLocaleUpperCase("pt-BR");
                          setPessoas(pessoas.map((x, j) => (j === i ? { ...x, nome: v } : x)));
                        }} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Parentesco</Label>
                      <Select value={p.parentesco}
                        onValueChange={(v) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, parentesco: v } : x)))}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Escolher" /></SelectTrigger>
                        <SelectContent>
                          {PARENTESCO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Data de nascimento</Label>
                      <Input className="h-11" type="date" value={p.data_nascimento}
                        onChange={(e) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, data_nascimento: e.target.value } : x)))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">CPF (se tiver)</Label>
                      <Input className="h-11" value={p.cpf}
                        onChange={(e) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, cpf: e.target.value } : x)))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">RG (se tiver)</Label>
                      <Input className="h-11" value={p.rg}
                        onChange={(e) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, rg: e.target.value } : x)))} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <span className="text-sm">Declarar como dependente</span>
                    <Switch checked={p.finalidade_dependente}
                      onCheckedChange={(v) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, finalidade_dependente: v } : x)))} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <span className="text-sm">Cadastrar no Sesc</span>
                    <Switch checked={p.finalidade_sesc}
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
                const ok = enviadosPorChave.has(chave);
                const doc = documentoPorChave.get(chave);
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
                      {doc?.status === "recusado" && (
                        <p className="text-xs text-destructive mt-1">
                          A empresa pediu uma nova foto deste documento.
                        </p>
                      )}
                    </div>
                    {ok && <Badge variant="outline" className="text-emerald-600">Enviado</Badge>}
                    <Button size="sm" variant={ok ? "outline" : "default"} className="h-10"
                      disabled={subindo === item.key} onClick={() => escolherArquivo(item)}>
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
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t bg-background p-3 flex gap-2">
        <Button variant="outline" className="h-12" disabled={etapa === 0 || salvando}
          onClick={() => setEtapa((n) => Math.max(0, n - 1))}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" className="h-12 flex-1" disabled={salvando} onClick={() => salvar(false)}>
          Guardar
        </Button>
        {ehDocumentos ? (
          <Button className="h-12 flex-1" disabled={salvando} onClick={enviar}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        ) : (
          <Button className="h-12 flex-1" disabled={salvando} onClick={() => salvar(true)}>
            Continuar <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </footer>
    </div>
  );
}

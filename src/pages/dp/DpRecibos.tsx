import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Link2, MessageCircle, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { diasRestantesCarencia } from "@/lib/dp/desligamento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpDataList, DpListCard } from "@/components/dp/DpDataList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { DpFilters, DpFilterField } from "@/components/dp/DpFilters";
import { useCompanyUnidades } from "@/hooks/useCompanyUnidades";
import { DpStatusBadge } from "@/components/dp/DpStatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReciboDetalhesDialog, type ReciboDetalhado } from "@/components/dp/documentos/ReciboDetalhesDialog";
import { brlParaCents, centsParaBRL, MODALIDADE_LABEL, COMPROVANTE_MODALIDADES } from "@/lib/dp/comprovante-quitacao";
import { certificadoValidacaoPdf } from "@/lib/dp/documento-certificado";
import {
  CANAIS_ASSINATURA,
  cancelarRecibo,
  ehNatureza,
  emitirRecibo,
  gerarLinkRecibo,
  NATUREZA_RECIBO_LABEL,
  NATUREZAS_RECIBO,
  reciboPdfUrl,
  statusRecibo,
  valorSugeridoCents,
  dataSugeridaPagamento,
  whatsappUrl,
  type CanalAssinatura,
  type NaturezaRecibo,
} from "@/lib/dp/recibos";

const AVULSO = "__avulso__";
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const mesAnterior = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const fmtBRL = (c: number | null) => (c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
const dataBR = (v?: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");

export default function DpRecibos() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const colabs = useDpColaboradores();

  const [aba, setAba] = useState(params.get("aba") === "historico" ? "historico" : "emitir");
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [pagoEmManual, setPagoEmManual] = useState(false);
  const unidades = useCompanyUnidades(selectedCompanyId ?? undefined);
  const unidadesCfg = useQuery({
    queryKey: ["dp_unidades_adiantamento", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("dp_unidades").select("id, dia_adiantamento").eq("company_id", selectedCompanyId);
      return (data ?? []) as { id: string; dia_adiantamento: number | null }[];
    },
  });
  const [colabId, setColabId] = useState<string>(params.get("colaborador") ?? "");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [whats, setWhats] = useState("");
  const natInicial = params.get("natureza");
  const [natureza, setNatureza] = useState<NaturezaRecibo>(ehNatureza(natInicial) ? natInicial : "acerto_mensal");
  const [descricao, setDescricao] = useState("");
  const [competencia, setCompetencia] = useState(params.get("competencia") ?? mesAnterior());
  const [pagoEm, setPagoEm] = useState(hoje());
  const [valor, setValor] = useState("");
  const [modalidade, setModalidade] = useState<"bancario" | "especie" | "misto">("bancario");
  const [valorBanco, setValorBanco] = useState("");
  const [valorEspecie, setValorEspecie] = useState("");
  const [canal, setCanal] = useState<CanalAssinatura>("portal");
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ id: string; link?: string; whatsapp: string | null; nome: string } | null>(null);
  const [detalhe, setDetalhe] = useState<ReciboDetalhado | null>(null);
  const veioDePendencia = params.has("colaborador") && params.has("competencia");

  const avulso = colabId === AVULSO;
  const colab = useMemo(
    () => (colabs.data ?? []).find((c) => c.id === colabId) as Record<string, any> | undefined,
    [colabs.data, colabId],
  );
  const ativos = useMemo(
    () => (colabs.data ?? []).filter((c: any) =>
      (mostrarInativos || c.ativo !== false) && (!unidadeId || c.unidade_id === unidadeId)),
    [colabs.data, mostrarInativos, unidadeId],
  );
  // Ao abrir pela pendência, a unidade vem do colaborador.
  useEffect(() => {
    if (!unidadeId && colab?.unidade_id) setUnidadeId(String(colab.unidade_id));
    if (colab && colab.ativo === false) setMostrarInativos(true);
  }, [colab, unidadeId]);

  // Valor sugerido da ficha ao trocar pessoa/natureza (o gestor pode ajustar).
  useEffect(() => {
    const sug = valorSugeridoCents(colab ?? null, natureza);
    if (sug) setValor(fmtBRL(sug));
  }, [colab, natureza]);
  useEffect(() => {
    if (avulso && canal === "portal") setCanal("whatsapp");
    if (colab) setWhats(String(colab.whatsapp || colab.telefone || ""));
  }, [avulso, colab, canal]);

  // Alerta: colaborador sem acesso ao portal ou com acesso terminando em até 2 dias.
  const avisoPortal = useMemo(() => {
    if (!colab) return null;
    if (!colab.user_id) return "Este colaborador não tem acesso ao Portal do Colaborador.";
    if (colab.ativo !== false) return null;
    const dias = diasRestantesCarencia(colab.acesso_portal_ate ?? null);
    if (dias == null || dias < 0) return "O acesso deste colaborador ao portal já foi encerrado.";
    if (dias <= 2) return `O acesso deste colaborador ao portal termina ${dias === 0 ? "hoje" : `em ${dias} ${dias === 1 ? "dia" : "dias"}`}.`;
    return null;
  }, [colab]);

  const recibos = useQuery({
    queryKey: ["dp_recibos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dp_recibos")
        .select("id, unidade_id, colaborador_id, documento_id, beneficiario_nome, beneficiario_cpf, beneficiario_whatsapp, natureza, descricao, competencia, pago_em, valor_cents, modalidade, valor_bancario_cents, valor_especie_cents, canal_assinatura, link_expira_em, link_enviado_em, assinado_em, assinado_ip, assinado_user_agent, cancelado_em, created_at")
        .eq("company_id", selectedCompanyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ReciboDetalhado[];
    },
  });

  const [fBusca, setFBusca] = useState("");
  const [fUnidade, setFUnidade] = useState("");
  const [fNatureza, setFNatureza] = useState("");
  const [fCompetencia, setFCompetencia] = useState("");
  const [fSituacao, setFSituacao] = useState("");
  const [fModalidade, setFModalidade] = useState("");
  const filtrados = useMemo(() => {
    const q = fBusca.trim().toUpperCase();
    const dig = fBusca.replace(/\D+/g, "");
    return (recibos.data ?? []).filter((r: any) => {
      if (q && !(String(r.beneficiario_nome ?? "").toUpperCase().includes(q) || (dig && String(r.beneficiario_cpf ?? "").includes(dig)))) return false;
      if (fUnidade && r.unidade_id !== fUnidade) return false;
      if (fNatureza && r.natureza !== fNatureza) return false;
      if (fCompetencia && r.competencia.slice(0, 7) !== fCompetencia) return false;
      if (fModalidade && r.modalidade !== fModalidade) return false;
      if (fSituacao === "cancelado" && !r.cancelado_em) return false;
      if (fSituacao === "assinado" && (!r.assinado_em || r.cancelado_em)) return false;
      if (fSituacao === "pendente" && (r.assinado_em || r.cancelado_em)) return false;
      return true;
    });
  }, [recibos.data, fBusca, fUnidade, fNatureza, fCompetencia, fSituacao, fModalidade]);
  const chipsFiltro = [
    fUnidade && { key: "u", label: (unidades.data ?? []).find((u) => u.id === fUnidade)?.nome ?? "Unidade", onRemove: () => setFUnidade("") },
    fNatureza && { key: "n", label: NATUREZA_RECIBO_LABEL[fNatureza as NaturezaRecibo] ?? fNatureza, onRemove: () => setFNatureza("") },
    fCompetencia && { key: "c", label: fCompetencia.split("-").reverse().join("/"), onRemove: () => setFCompetencia("") },
    fSituacao && { key: "s", label: fSituacao === "pendente" ? "Aguardando" : fSituacao === "assinado" ? "Assinado" : "Cancelado", onRemove: () => setFSituacao("") },
    fModalidade && { key: "m", label: MODALIDADE_LABEL[fModalidade as keyof typeof MODALIDADE_LABEL], onRemove: () => setFModalidade("") },
  ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[];

  // Data sugerida: aprende com o último recibo igual (mesma natureza e unidade);
  // sem histórico, usa a regra da unidade (adiantamento) ou o 5º dia útil.
  const unidadeEfetiva = unidadeId || (colab?.unidade_id as string | undefined) || "";
  useEffect(() => {
    if (pagoEmManual || !competencia) return;
    const anterior = (recibos.data ?? []).find((r: any) => !r.cancelado_em && r.natureza === natureza
      && (!unidadeEfetiva || r.unidade_id === unidadeEfetiva));
    let sug: string | null = null;
    if (anterior) {
      const [cy, cm] = anterior.competencia.slice(0, 7).split("-").map(Number);
      const [py, pm, pd] = anterior.pago_em.slice(0, 10).split("-").map(Number);
      const desloc = (py - cy) * 12 + (pm - cm);
      const [y, m] = competencia.split("-").map(Number);
      const alvo = new Date(y, m - 1 + desloc, 1);
      const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
      sug = `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(Math.min(pd, ultimo)).padStart(2, "0")}`;
    } else {
      const dia = (unidadesCfg.data ?? []).find((u) => u.id === unidadeEfetiva)?.dia_adiantamento;
      sug = dataSugeridaPagamento(natureza, competencia, dia);
    }
    if (sug) setPagoEm(sug > hoje() ? hoje() : sug);
  }, [natureza, competencia, unidadeEfetiva, recibos.data, unidadesCfg.data, pagoEmManual]);

  function limparFormulario() {
    setColabId(""); setNome(""); setCpf(""); setWhats(""); setDescricao(""); setValor("");
    setValorBanco(""); setValorEspecie(""); setModalidade("bancario"); setCanal("portal");
    setPagoEmManual(false);
  }

  async function abrirPdf(id: string) {
    try {
      window.open(await reciboPdfUrl(id), "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function enviarWhats(id: string, numero: string | null, nomeB: string) {
    try {
      const r = await gerarLinkRecibo(id);
      window.open(whatsappUrl(r.whatsapp ?? numero, nomeB, r.link), "_blank", "noopener");
      qc.invalidateQueries({ queryKey: ["dp_recibos"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function copiarLink(r: ReciboDetalhado) {
    try {
      const link = await gerarLinkRecibo(r.id);
      await navigator.clipboard.writeText(link.link);
      toast.success("Link copiado.");
      qc.invalidateQueries({ queryKey: ["dp_recibos"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function abrirCertificado(documentoId: string) {
    try {
      const certificado = await certificadoValidacaoPdf(documentoId);
      window.open(certificado.url, "_blank", "noopener");
      window.setTimeout(certificado.revogar, 60_000);
    } catch (e) { toast.error((e as Error).message); }
  }

  async function cancelar(r: ReciboDetalhado) {
    try {
      await cancelarRecibo(r.id);
      setDetalhe(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["dp_recibos"] }),
        qc.invalidateQueries({ queryKey: ["dp_pendencias"] }),
      ]);
      toast.success("Recibo cancelado e pendências atualizadas.");
    } catch (e) { toast.error((e as Error).message); }
  }

  async function emitir() {
    if (!selectedCompanyId) return;
    if (!colabId) return toast.error("Escolha quem recebeu o pagamento.");
    const total = brlParaCents(valor);
    if (!total) return toast.error("Informe o valor do recibo.");
    const banco = modalidade === "misto" ? brlParaCents(valorBanco) : null;
    const especie = modalidade === "misto" ? brlParaCents(valorEspecie) : null;
    if (modalidade === "misto" && (!banco || !especie || banco + especie !== total)) {
      return toast.error("No pagamento misto, a parte em conta + a parte em dinheiro precisa dar o valor total.");
    }
    setSalvando(true);
    try {
      const r = await emitirRecibo({
        company_id: selectedCompanyId,
        colaborador_id: avulso ? null : colabId,
        beneficiario_nome: avulso ? nome : undefined,
        beneficiario_cpf: avulso ? cpf : undefined,
        beneficiario_whatsapp: whats || undefined,
        natureza,
        descricao: descricao || undefined,
        competencia,
        pago_em: pagoEm,
        valor_cents: total,
        modalidade,
        valor_bancario_cents: banco,
        valor_especie_cents: especie,
        canal_assinatura: canal,
      });
      const nomeB = avulso ? nome.toUpperCase() : String(colab?.nome ?? "");
      setResultado({ id: r.recibo_id, link: r.link, whatsapp: r.whatsapp, nome: nomeB });
      limparFormulario();
      toast.success(r.documento_id ? "Recibo emitido e guardado nos documentos do colaborador." : "Recibo emitido.");
      qc.invalidateQueries({ queryKey: ["dp_recibos"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      if (canal === "fisico") abrirPdf(r.recibo_id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <DpPage>
      <Helmet><title>Recibos | Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Receipt}
        title="Recibos"
        description="Recibos de freelancer, diária, teste operacional, rescisão e outros pagamentos, com assinatura digital."
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="emitir">Emitir Recibo</TabsTrigger>
          <TabsTrigger value="historico">Histórico de Recibos</TabsTrigger>
        </TabsList>
        <TabsContent value="emitir" className="mt-0">

      <DpContentCard contentClassName="p-4 md:p-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select value={unidadeId || "__todas__"} onValueChange={(v) => { setUnidadeId(v === "__todas__" ? "" : v); if (colabId !== AVULSO) setColabId(""); }}>
              <SelectTrigger><SelectValue placeholder="Escolha a unidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__todas__">Todas as Unidades</SelectItem>
                {(unidades.data ?? []).filter((u) => u.ativo !== false).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={mostrarInativos} onCheckedChange={setMostrarInativos} />
              Mostrar desligados
            </label>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Quem Recebeu</Label>
            <Select value={colabId} onValueChange={(v) => { setColabId(v); setResultado(null); }}>
              <SelectTrigger><SelectValue placeholder="Escolha o colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={AVULSO}>Pessoa sem cadastro (teste, diarista…)</SelectItem>
                {ativos.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}{!unidadeId && c.unidade_nome ? ` · ${c.unidade_nome}` : ""}{c.ativo === false ? " (Desligado)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {avulso && (
            <>
              <div className="space-y-1.5">
                <Label>Nome Completo</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF</Label>
                <Input value={cpf} inputMode="numeric" onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Natureza</Label>
            <Select value={natureza} onValueChange={(v) => setNatureza(v as NaturezaRecibo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NATUREZAS_RECIBO.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{NATUREZAS_RECIBO.find((n) => n.value === natureza)?.ajuda}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Competência</Label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data do Pagamento</Label>
            <Input type="date" value={pagoEm} max={hoje()} onChange={(e) => { setPagoEm(e.target.value); setPagoEmManual(true); }} />
            {!pagoEmManual && <p className="text-xs text-muted-foreground">Sugerida pela rotina da unidade; ajuste se precisar.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Valor Total (R$)</Label>
            <Input value={valor} inputMode="decimal" onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            {colab && valorSugeridoCents(colab, natureza) && (
              <p className="text-xs text-muted-foreground">Sugerido pela ficha; ajuste se precisar.</p>
            )}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Descrição (Opcional)</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: diária do evento de sábado" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Forma de Pagamento</Label>
          <RadioGroup value={modalidade} onValueChange={(v) => setModalidade(v as typeof modalidade)} className="grid gap-2 sm:grid-cols-3">
            {COMPROVANTE_MODALIDADES.map((m) => (
              <label key={m} className="flex items-center gap-2 rounded-md border p-3 text-sm cursor-pointer">
                <RadioGroupItem value={m} /> {MODALIDADE_LABEL[m]}
              </label>
            ))}
          </RadioGroup>
          {modalidade === "misto" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Parte em Conta (R$)</Label><Input value={valorBanco} inputMode="decimal" onChange={(e) => setValorBanco(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Parte em Dinheiro (R$)</Label><Input value={valorEspecie} inputMode="decimal" onChange={(e) => setValorEspecie(e.target.value)} /></div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Como Vai Assinar</Label>
          <RadioGroup value={canal} onValueChange={(v) => setCanal(v as CanalAssinatura)} className="grid gap-2 sm:grid-cols-3">
            {CANAIS_ASSINATURA.filter((c) => avulso ? c.value !== "portal" : (colab?.ativo === false || c.value !== "whatsapp")).map((c) => (
              <label key={c.value} className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
                <RadioGroupItem value={c.value} className="mt-0.5" />
                <span><span className="font-medium">{c.label}</span><span className="block text-xs text-muted-foreground">{c.ajuda}</span></span>
              </label>
            ))}
          </RadioGroup>
          {canal === "portal" && avisoPortal && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="font-medium text-destructive">{avisoPortal}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Ele pode não conseguir assinar a tempo. Prefira o link pelo WhatsApp ou a assinatura à mão.
              </p>
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setCanal("fisico")}>
                Usar Assinatura à Mão
              </Button>
            </div>
          )}
          {canal === "whatsapp" && (
            <div className="space-y-1.5 sm:max-w-xs">
              <Label>WhatsApp</Label>
              <Input value={whats} inputMode="tel" onChange={(e) => setWhats(e.target.value)} placeholder="(62) 99999-9999" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={emitir} disabled={salvando}>{salvando ? "Emitindo…" : "Gerar Recibo"}</Button>
        </div>

        {resultado && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-medium">Recibo emitido para {resultado.nome}. O formulário foi limpo para o próximo.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => abrirPdf(resultado.id)}><Download className="h-4 w-4 mr-1" />Baixar PDF</Button>
              {veioDePendencia && <Button variant="outline" onClick={() => navigate("/dp")} >Voltar às Pendências</Button>}
              {resultado.link && (
                <>
                  <Button onClick={() => window.open(whatsappUrl(resultado.whatsapp, resultado.nome, resultado.link!), "_blank", "noopener")}>
                    <MessageCircle className="h-4 w-4 mr-1" />Enviar pelo WhatsApp
                  </Button>
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText(resultado.link!); toast.success("Link copiado."); }}>
                    <Link2 className="h-4 w-4 mr-1" />Copiar Link
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DpContentCard>
        </TabsContent>
        <TabsContent value="historico" className="mt-0 space-y-4">
      <DpFilters
        search={{ value: fBusca, onChange: setFBusca, placeholder: "Nome ou CPF" }}
        chips={chipsFiltro}
        onClear={() => { setFBusca(""); setFUnidade(""); setFNatureza(""); setFCompetencia(""); setFSituacao(""); setFModalidade(""); }}
      >
        <DpFilterField label="Unidade">
          <Select value={fUnidade || "_"} onValueChange={(v) => setFUnidade(v === "_" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="_">Todas</SelectItem>{(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
          </Select>
        </DpFilterField>
        <DpFilterField label="Natureza">
          <Select value={fNatureza || "_"} onValueChange={(v) => setFNatureza(v === "_" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="_">Todas</SelectItem>{NATUREZAS_RECIBO.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}</SelectContent>
          </Select>
        </DpFilterField>
        <DpFilterField label="Competência">
          <Input type="month" value={fCompetencia} onChange={(e) => setFCompetencia(e.target.value)} />
        </DpFilterField>
        <DpFilterField label="Situação">
          <Select value={fSituacao || "_"} onValueChange={(v) => setFSituacao(v === "_" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_">Todas</SelectItem>
              <SelectItem value="pendente">Aguardando Assinatura</SelectItem>
              <SelectItem value="assinado">Assinado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </DpFilterField>
        <DpFilterField label="Forma de Pagamento">
          <Select value={fModalidade || "_"} onValueChange={(v) => setFModalidade(v === "_" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="_">Todas</SelectItem>{COMPROVANTE_MODALIDADES.map((m) => <SelectItem key={m} value={m}>{MODALIDADE_LABEL[m]}</SelectItem>)}</SelectContent>
          </Select>
        </DpFilterField>
      </DpFilters>

      <DpContentCard contentClassName="p-4 md:p-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Recibos Emitidos</h2>
          <p className="text-sm text-muted-foreground">{filtrados.length} recibo(s) · {centsParaBRL(filtrados.filter((r) => !r.cancelado_em).reduce((a, r) => a + r.valor_cents, 0))}</p>
        </div>
        {recibos.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !filtrados.length ? (
          <p className="text-sm text-muted-foreground">Nenhum recibo encontrado.</p>
        ) : (
          <DpDataList
            table={<Table><TableHeader><TableRow><TableHead>Beneficiário</TableHead><TableHead>Natureza</TableHead><TableHead>Competência</TableHead><TableHead>Valor</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader><TableBody>{filtrados.map((r) => { const st = statusRecibo(r); return <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetalhe(r)}><TableCell className="font-medium">{r.beneficiario_nome}</TableCell><TableCell>{NATUREZA_RECIBO_LABEL[r.natureza as NaturezaRecibo] ?? r.natureza}</TableCell><TableCell>{r.competencia.slice(5, 7)}/{r.competencia.slice(0, 4)}</TableCell><TableCell>{centsParaBRL(r.valor_cents)}</TableCell><TableCell><DpStatusBadge tone={r.cancelado_em ? "danger" : r.assinado_em ? "success" : "warning"}>{st.label}</DpStatusBadge></TableCell></TableRow>; })}</TableBody></Table>}
            cards={<>{filtrados.map((r) => { const st = statusRecibo(r); return <DpListCard key={r.id} title={r.beneficiario_nome} subtitle={`${NATUREZA_RECIBO_LABEL[r.natureza as NaturezaRecibo] ?? r.natureza} · ${r.competencia.slice(5, 7)}/${r.competencia.slice(0, 4)}`} meta={`${centsParaBRL(r.valor_cents)} · pago em ${dataBR(r.pago_em)}`} badges={<DpStatusBadge tone={r.cancelado_em ? "danger" : r.assinado_em ? "success" : "warning"}>{st.label}</DpStatusBadge>} onOpen={() => setDetalhe(r)} openLabel="Detalhes" />; })}</>}
          />
        )}
      </DpContentCard>
        </TabsContent>
      </Tabs>

      <ReciboDetalhesDialog
        recibo={detalhe}
        onOpenChange={(open) => !open && setDetalhe(null)}
        onPdf={(r) => abrirPdf(r.id)}
        onWhatsApp={(r) => enviarWhats(r.id, r.beneficiario_whatsapp, r.beneficiario_nome)}
        onCopiarLink={copiarLink}
        onCertificado={(r) => r.documento_id && abrirCertificado(r.documento_id)}
        onCancelar={cancelar}
      />
    </DpPage>
  );
}

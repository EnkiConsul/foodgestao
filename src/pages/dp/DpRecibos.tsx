import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Link2, MessageCircle, Receipt, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { brlParaCents, centsParaBRL, MODALIDADE_LABEL, COMPROVANTE_MODALIDADES } from "@/lib/dp/comprovante-quitacao";
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

type Recibo = {
  id: string;
  beneficiario_nome: string;
  beneficiario_whatsapp: string | null;
  natureza: string;
  competencia: string;
  pago_em: string;
  valor_cents: number;
  modalidade: string;
  canal_assinatura: string;
  link_expira_em: string | null;
  assinado_em: string | null;
  cancelado_em: string | null;
  created_at: string;
};

export default function DpRecibos() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const colabs = useDpColaboradores();

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

  const avulso = colabId === AVULSO;
  const colab = useMemo(
    () => (colabs.data ?? []).find((c) => c.id === colabId) as Record<string, any> | undefined,
    [colabs.data, colabId],
  );
  const ativos = useMemo(() => (colabs.data ?? []).filter((c: any) => c.ativo !== false), [colabs.data]);

  // Valor sugerido da ficha ao trocar pessoa/natureza (o gestor pode ajustar).
  useEffect(() => {
    const sug = valorSugeridoCents(colab ?? null, natureza);
    if (sug) setValor(fmtBRL(sug));
  }, [colab, natureza]);
  useEffect(() => {
    if (avulso && canal === "portal") setCanal("whatsapp");
    if (colab) setWhats(String(colab.whatsapp || colab.telefone || ""));
  }, [avulso, colab, canal]);

  const recibos = useQuery({
    queryKey: ["dp_recibos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dp_recibos")
        .select("id, beneficiario_nome, beneficiario_whatsapp, natureza, competencia, pago_em, valor_cents, modalidade, canal_assinatura, link_expira_em, assinado_em, cancelado_em, created_at")
        .eq("company_id", selectedCompanyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Recibo[];
    },
  });

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
      <Helmet><title>Emitir Recibo | Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Receipt}
        title="Emitir Recibo"
        description="Recibos de freelancer, diária, teste operacional e outros pagamentos, com assinatura digital."
      />

      <DpContentCard contentClassName="p-4 md:p-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Quem Recebeu</Label>
            <Select value={colabId} onValueChange={(v) => { setColabId(v); setResultado(null); }}>
              <SelectTrigger><SelectValue placeholder="Escolha o colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={AVULSO}>Pessoa sem cadastro (teste, diarista…)</SelectItem>
                {ativos.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}{c.unidade_nome ? ` · ${c.unidade_nome}` : ""}
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
            <Input type="date" value={pagoEm} max={hoje()} onChange={(e) => setPagoEm(e.target.value)} />
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
            {CANAIS_ASSINATURA.filter((c) => !(avulso && c.value === "portal")).map((c) => (
              <label key={c.value} className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
                <RadioGroupItem value={c.value} className="mt-0.5" />
                <span><span className="font-medium">{c.label}</span><span className="block text-xs text-muted-foreground">{c.ajuda}</span></span>
              </label>
            ))}
          </RadioGroup>
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
            <p className="text-sm font-medium">Recibo emitido para {resultado.nome}.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => abrirPdf(resultado.id)}><Download className="h-4 w-4 mr-1" />Baixar PDF</Button>
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

      <DpContentCard contentClassName="p-4 md:p-6">
        <h2 className="text-base font-semibold mb-3">Recibos Emitidos</h2>
        {recibos.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !recibos.data?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum recibo emitido ainda.</p>
        ) : (
          <ul className="divide-y">
            {recibos.data.map((r) => {
              const st = statusRecibo(r);
              const aberto = !r.assinado_em && !r.cancelado_em;
              return (
                <li key={r.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.beneficiario_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {NATUREZA_RECIBO_LABEL[r.natureza as NaturezaRecibo] ?? r.natureza} · {r.competencia.slice(5, 7)}/{r.competencia.slice(0, 4)} · {centsParaBRL(r.valor_cents)} · pago em {dataBR(r.pago_em)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={st.tom === "ok" ? "default" : "outline"}>
                      {st.label}{r.assinado_em ? ` · ${dataBR(r.assinado_em)}` : ""}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => abrirPdf(r.id)} aria-label="Baixar PDF"><Download className="h-4 w-4" /></Button>
                    {aberto && (
                      <Button size="sm" variant="ghost" onClick={() => enviarWhats(r.id, r.beneficiario_whatsapp, r.beneficiario_nome)} aria-label="Enviar pelo WhatsApp">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {aberto && (
                      <Button size="sm" variant="ghost" aria-label="Cancelar recibo" onClick={async () => {
                        if (!window.confirm("Cancelar este recibo?")) return;
                        try { await cancelarRecibo(r.id); qc.invalidateQueries({ queryKey: ["dp_recibos"] }); } catch (e) { toast.error((e as Error).message); }
                      }}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DpContentCard>
    </DpPage>
  );
}

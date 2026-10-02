import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, Download, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { AssinaturaCaptura } from "@/components/dp/AssinaturaCaptura";
import { centsParaBRL, modalidadeLabel } from "@/lib/dp/comprovante-quitacao";

type Resumo = {
  empresa: string;
  beneficiario: string;
  cpf_final: string | null;
  natureza: string;
  descricao: string | null;
  competencia: string;
  pago_em: string;
  valor_cents: number;
  modalidade: string;
  assinado_em: string | null;
  liberado?: boolean;
};

const dataBR = (v?: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("dp-recibo-publico", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let msg = "Não foi possível concluir agora.";
    try { const j = await ctx?.json(); if (j?.error) msg = j.error; } catch { /* sem corpo */ }
    throw new Error(msg);
  }
  return data;
}

export default function ReciboPublico() {
  const { token = "" } = useParams();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [concordo, setConcordo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [assinatura, setAssinatura] = useState<string | null>(null);

  useEffect(() => {
    chamar({ acao: "ver", token }).then(setResumo).catch((e) => setErro(e.message));
  }, [token]);

  async function baixar() {
    try {
      const data = await chamar({ acao: "pdf", token });
      const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function assinar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await chamar({ acao: "assinar", token, cpf, concordo, assinatura });
      setResumo((s) => (s ? { ...s, assinado_em: r.assinado_em } : s));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <Helmet><title>Assinar Recibo | AVETO 360</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Receipt className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Recibo de Pagamento</h1>
        </div>

        {!resumo && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {erro && !resumo && <Card><CardContent className="p-5 text-sm">{erro}</CardContent></Card>}

        {resumo && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">{resumo.empresa}</p>
                <p className="text-2xl font-semibold">{centsParaBRL(resumo.valor_cents)}</p>
                <p className="text-sm">{resumo.natureza} · competência {resumo.competencia.slice(5, 7)}/{resumo.competencia.slice(0, 4)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Recebedor</dt><dd className="font-medium">{resumo.beneficiario}</dd>
                <dt className="text-muted-foreground">Pago em</dt><dd>{dataBR(resumo.pago_em)}</dd>
                <dt className="text-muted-foreground">Forma</dt><dd>{modalidadeLabel(resumo.modalidade)}</dd>
                {resumo.descricao && (<><dt className="text-muted-foreground">Descrição</dt><dd>{resumo.descricao}</dd></>)}
              </dl>
              <Button variant="outline" className="w-full" onClick={baixar}><Download className="h-4 w-4 mr-1" />Ver Recibo Completo</Button>

              {resumo.assinado_em ? (
                <div className="flex items-center gap-2 rounded-md bg-primary/10 p-3 text-sm">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Recibo assinado em {new Date(resumo.assinado_em).toLocaleString("pt-BR")}.
                </div>
              ) : resumo.liberado === false ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  Disponível para assinatura a partir de {dataBR(resumo.pago_em)}, data do pagamento. Você já pode conferir o recibo acima.
                </div>
              ) : (
                <div className="space-y-3 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cpf">Confirme seu CPF{resumo.cpf_final ? ` (termina em ${resumo.cpf_final})` : ""}</Label>
                    <Input id="cpf" inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <AssinaturaCaptura nomePadrao={resumo.beneficiario} onChange={setAssinatura} />
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={concordo} onCheckedChange={(v) => setConcordo(v === true)} className="mt-0.5" />
                    Li o recibo e declaro que recebi o valor informado, dando quitação.
                  </label>
                  {erro && <p className="text-sm text-destructive">{erro}</p>}
                  <Button className="w-full" disabled={!concordo || !assinatura || cpf.replace(/\D/g, "").length !== 11 || enviando} onClick={assinar}>
                    {enviando ? "Assinando…" : "Assinar Recibo"}
                  </Button>
                  <p className="text-xs text-muted-foreground">Registramos data, hora, endereço de internet e aparelho como prova da assinatura.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

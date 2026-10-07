import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, Download, NotebookPen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { AssinaturaCaptura } from "@/components/dp/AssinaturaCaptura";

type Resumo = { empresa: string; nome: string; titulo: string; data_reuniao: string; modalidade: string; assinado_em: string | null; cpf_final: string | null };
const dataBR = (v?: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("dp-ata-avulso", { body });
  if (error) {
    let msg = "Não foi possível concluir agora.";
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* */ }
    throw new Error(msg);
  }
  return data;
}

/** Assinatura da ata pelo link do WhatsApp, para quem não tem cadastro. */
export default function AtaPublica() {
  const { token = "" } = useParams();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [concordo, setConcordo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [assinatura, setAssinatura] = useState<string | null>(null);

  useEffect(() => { chamar({ acao: "ver", token }).then(setResumo).catch((e) => setErro(e.message)); }, [token]);

  async function baixar() {
    try {
      const data = await chamar({ acao: "pdf", token });
      const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) { setErro((e as Error).message); }
  }

  async function assinar() {
    setEnviando(true); setErro(null);
    try {
      const r = await chamar({ acao: "assinar", token, cpf, concordo, assinatura });
      setResumo((s) => (s ? { ...s, assinado_em: r.assinado_em } : s));
    } catch (e) { setErro((e as Error).message); } finally { setEnviando(false); }
  }

  const ciencia = resumo?.modalidade === "ciencia";
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <Helmet><title>Assinar Ata | AVETO 360</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2 text-primary"><NotebookPen className="h-5 w-5" /><h1 className="text-lg font-semibold">Ata de Reunião</h1></div>
        {!resumo && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {erro && !resumo && <Card><CardContent className="p-5 text-sm">{erro}</CardContent></Card>}
        {resumo && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-xs text-muted-foreground">{resumo.empresa}</p>
                <p className="text-lg font-semibold">{resumo.titulo}</p>
                <p className="text-sm">Reunião de {dataBR(resumo.data_reuniao)} · {resumo.nome}</p>
              </div>
              <Button variant="outline" className="w-full" onClick={baixar}><Download className="mr-1 h-4 w-4" />Ler a Ata Completa</Button>
              {resumo.assinado_em ? (
                <div className="flex items-center gap-2 rounded-md bg-primary/10 p-3 text-sm"><CheckCircle2 className="h-5 w-5 text-primary" />Ata assinada em {new Date(resumo.assinado_em).toLocaleString("pt-BR")}.</div>
              ) : (
                <div className="space-y-3 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cpf">Confirme seu CPF{resumo.cpf_final ? ` (termina em ${resumo.cpf_final})` : ""}</Label>
                    <Input id="cpf" inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <AssinaturaCaptura nomePadrao={resumo.nome} onChange={setAssinatura} />
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={concordo} onCheckedChange={(v) => setConcordo(v === true)} className="mt-0.5" />
                    {ciencia ? "Li a ata e declaro ciência do conteúdo." : "Li a ata e confirmo que participei da reunião."}
                  </label>
                  {erro && <p className="text-sm text-destructive">{erro}</p>}
                  <Button className="w-full" disabled={!concordo || !assinatura || cpf.replace(/\D/g, "").length !== 11 || enviando} onClick={assinar}>{enviando ? "Assinando…" : "Assinar Ata"}</Button>
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

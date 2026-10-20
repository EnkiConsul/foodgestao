import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { MapPin, Clock, Briefcase, Users, Wallet, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TIPOS_CONTRATACAO } from "@/lib/recrutamento/vagas";
import assinatura360 from "@/assets/aveto360-assinatura.png.asset.json";

interface VagaPub {
  codigo: string; titulo: string; quantidade: number; empresa: string; unidade: string | null;
  cidade: string | null; bairro: string | null; jornada: string | null; escala: string | null;
  tipo_contratacao: string; remuneracao: string | null; beneficios: string | null;
  atividades: string | null; requisitos: string | null; estado: string; candidaturas_abertas: boolean;
}

function Bloco({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <section className="space-y-1">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <p className="text-sm text-muted-foreground whitespace-pre-line">{texto}</p>
    </section>
  );
}

export default function VagaPublica() {
  const { codigo = "" } = useParams();
  const q = useQuery({
    queryKey: ["vaga-publica", codigo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("recrutamento_vaga_publica", { _codigo: codigo });
      if (error) throw error;
      return data as unknown as VagaPub | null;
    },
  });
  const v = q.data;
  const local = v ? [v.bairro, v.cidade].filter(Boolean).join(" · ") : "";

  return (
    <div className="min-h-[100dvh] bg-muted/40">
      <Helmet>
        <title>{v ? `${v.titulo} — ${v.empresa}` : "Vaga"} | AVETO Recrutamento 360</title>
        <meta name="description" content={v ? `Vaga de ${v.titulo} em ${v.empresa}.` : "Vaga de emprego no AVETO 360."} />
      </Helmet>
      <header className="bg-background border-b">
        <div className="mx-auto max-w-xl px-4 py-3 flex items-center justify-between">
          <img src={assinatura360.url} alt="AVETO 360" className="h-8 w-auto" />
          <span className="text-xs text-muted-foreground">Recrutamento 360</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-5 space-y-4">
        {q.isLoading && <p className="text-sm text-muted-foreground">Carregando vaga…</p>}
        {q.isError && <p className="text-sm text-destructive">Não foi possível carregar a vaga. Tente novamente.</p>}
        {!q.isLoading && !q.isError && !v && (
          <Card><CardContent className="p-5 text-sm">Vaga não encontrada.</CardContent></Card>
        )}
        {v && (
          <>
            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="text-xs text-muted-foreground">{v.empresa}{v.unidade ? ` · ${v.unidade}` : ""}</p>
                <h1 className="text-xl font-bold leading-tight break-words">{v.titulo}</h1>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1"><Briefcase className="h-3 w-3" />{TIPOS_CONTRATACAO[v.tipo_contratacao] ?? v.tipo_contratacao}</Badge>
                  <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" />{v.quantidade} {v.quantidade > 1 ? "vagas" : "vaga"}</Badge>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {local && <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary" />{local}</li>}
                  {(v.jornada || v.escala) && <li className="flex gap-2"><Clock className="h-4 w-4 shrink-0 text-primary" />{[v.jornada, v.escala].filter(Boolean).join(" · ")}</li>}
                  {v.remuneracao && <li className="flex gap-2"><Wallet className="h-4 w-4 shrink-0 text-primary" />{v.remuneracao}</li>}
                </ul>
              </CardContent>
            </Card>

            {v.estado !== "ativa" && (
              <Card className="border-destructive/40">
                <CardContent className="p-4 text-sm flex gap-2">
                  <Info className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                  {v.estado === "pausada" && "Esta vaga está pausada no momento e não recebe candidaturas."}
                  {v.estado === "encerrada" && "Esta vaga foi encerrada."}
                  {v.estado === "expirada" && "O prazo de publicação desta vaga terminou."}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-5 space-y-4">
                <Bloco titulo="Atividades" texto={v.atividades} />
                <Bloco titulo="Requisitos" texto={v.requisitos} />
                <Bloco titulo="Benefícios" texto={v.beneficios} />
              </CardContent>
            </Card>

            {v.estado === "ativa" && (
              <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-background/95 border-t space-y-1">
                <Button className="w-full h-11" disabled>Candidaturas abrem em breve</Button>
                <p className="text-[11px] text-center text-muted-foreground">As inscrições por esta página serão liberadas em breve.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

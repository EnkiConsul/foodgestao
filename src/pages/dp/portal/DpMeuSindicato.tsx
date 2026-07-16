import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import { Users2, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";

export default function DpMeuSindicato() {
  const { user } = useAuth();

  const data = useQuery({
    queryKey: ["dp_meu_sindicato", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: colab } = await supabase
        .from("dp_colaboradores").select("sindicato_id").eq("user_id", user!.id).maybeSingle();
      if (!colab?.sindicato_id) return { sindicato: null, negociacoes: [] };
      const { data: sindicato } = await supabase
        .from("dp_sindicatos").select("*").eq("id", colab.sindicato_id).maybeSingle();
      const { data: negociacoes } = await supabase
        .from("dp_sindicato_negociacoes").select("*")
        .eq("sindicato_id", colab.sindicato_id)
        .order("vigencia_inicio", { ascending: false });
      return { sindicato, negociacoes: negociacoes ?? [] };
    },
  });

  const openPdf = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const s = data.data?.sindicato as any;

  return (
    <DpPage>
      <Helmet><title>Meu sindicato — Portal</title></Helmet>
      <DpPageHeader icon={Users2} title="Meu sindicato" />
      {!s ? (
        <DpContentCard><DpEmptyState icon={Users2}>Nenhum sindicato vinculado.</DpEmptyState></DpContentCard>
      ) : (
        <>
          <Card className="dp-content-card">
            <CardHeader>
              <CardTitle>{s.nome}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {s.cnpj ?? "—"} · <Badge variant="outline" className="uppercase">{s.tipo}</Badge>
              </p>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {s.contato_nome && <p><b>Contato:</b> {s.contato_nome}</p>}
              {s.contato_email && <p><b>E-mail:</b> {s.contato_email}</p>}
              {s.contato_telefone && <p><b>Telefone:</b> {s.contato_telefone}</p>}
              {s.data_base && <p><b>Data-base:</b> {s.data_base}</p>}
            </CardContent>
          </Card>

          <h2 className="text-lg font-semibold">ACT / CCT & Negociações</h2>
          {(data.data?.negociacoes.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Sem documentos publicados.</p>
          ) : (
            <div className="grid gap-3">
              {data.data!.negociacoes.map((n: any) => (
                <Card key={n.id} className="dp-content-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Badge variant="outline" className="uppercase">{n.tipo_documento ?? "act"}</Badge>
                        {n.ano ? `${n.ano}${n.mes ? "/" + String(n.mes).padStart(2, "0") : ""}` : n.vigencia_inicio}
                      </CardTitle>
                      {n.pdf_path && (
                        <Button size="sm" variant="outline" onClick={() => openPdf(n.pdf_path)}>
                          <FileText className="h-4 w-4 mr-1" /> PDF
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {n.vigencia_inicio && `Vig. ${format(new Date(n.vigencia_inicio), "dd/MM/yyyy")}`}
                      {n.vigencia_fim && ` a ${format(new Date(n.vigencia_fim), "dd/MM/yyyy")}`}
                      {n.reajuste_pct != null && ` · Reajuste ${n.reajuste_pct}%`}
                    </p>
                  </CardHeader>
                  {n.observacoes && (
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{n.observacoes}</p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </DpPage>
  );
}

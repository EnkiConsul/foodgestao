import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Printer, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useMeusContracheques } from "@/hooks/useDpFolha";
import { FOLHA_TIPO_LABEL, LANCAMENTO_STATUS_LABEL, formatarBRL } from "@/lib/dp/folha";
import { imprimirHolerite } from "@/lib/dp/holerite";
import { Button } from "@/components/ui/button";

const rotuloCompetencia = (iso: string) =>
  iso ? new Date(`${iso.slice(0, 7)}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "—";

export default function DpMeuContracheque() {
  const { user } = useAuth();

  const me = useQuery({
    queryKey: ["dp_colaborador_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      return (data as string | null) ?? null;
    },
  });

  const { itens, isLoading } = useMeusContracheques(me.data ?? null);

  const nome = (user?.user_metadata?.full_name as string | undefined) ?? "Colaborador";

  const imprimir = (i: (typeof itens)[number]) => {
    const ok = imprimirHolerite(`Demonstrativo ${i.competencia.slice(0, 7)}`, [
      {
        empresa: "Aveto 360",
        colaborador: nome,
        competencia: i.competencia,
        tipo: i.tipo,
        detalhe: i.detalhe,
        valorBruto: i.valor_bruto,
        valorLiquido: i.valor_liquido,
        dataPagamento: i.data_pagamento,
      },
    ]);
    if (!ok) toast.error("Não foi possível abrir a impressão. Verifique o bloqueio de pop-ups.");
  };

  return (
    <div className="space-y-4 p-4 pb-24">
      <Helmet><title>Meus Contracheques — Aveto 360</title></Helmet>

      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Receipt className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">Meus Contracheques</h1>
          <p className="text-xs text-muted-foreground">Demonstrativos liberados pelo Departamento Pessoal.</p>
        </div>
      </header>

      {isLoading || me.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !itens.length ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhum demonstrativo liberado até o momento.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {itens.map((i) => (
            <AccordionItem key={i.id} value={i.id} className="rounded-2xl border bg-card px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex w-full items-center justify-between gap-3 pr-2">
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-medium first-letter:uppercase">{rotuloCompetencia(i.competencia)}</p>
                    <p className="text-xs text-muted-foreground">{FOLHA_TIPO_LABEL[i.tipo] ?? i.tipo}</p>
                  </div>
                  <span className="text-sm font-semibold">{formatarBRL(i.valor_liquido)}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1.5 pb-3 text-sm">
                  <li className="flex justify-between"><span className="text-muted-foreground">Horas normais</span><span>{formatarBRL(i.detalhe.proventos.normais)}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">Extras 50%</span><span>{formatarBRL(i.detalhe.proventos.extras50)}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">Extras 100%</span><span>{formatarBRL(i.detalhe.proventos.extras100)}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">Adicional noturno</span><span>{formatarBRL(i.detalhe.proventos.noturno)}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">Desconto de faltas</span><span>- {formatarBRL(i.detalhe.faltas)}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">Desconto de DSR</span><span>- {formatarBRL(i.detalhe.dsr)}</span></li>
                  <li className="flex justify-between border-t pt-2 font-medium"><span>Total bruto</span><span>{formatarBRL(i.valor_bruto)}</span></li>
                  <li className="flex justify-between font-semibold"><span>Líquido</span><span>{formatarBRL(i.valor_liquido)}</span></li>
                </ul>
                <div className="flex flex-wrap items-center gap-2 pb-3">
                  <Badge variant="secondary">{LANCAMENTO_STATUS_LABEL[i.status]}</Badge>
                  {i.data_pagamento && (
                    <span className="text-xs text-muted-foreground">
                      Pagamento em {new Date(`${i.data_pagamento}T12:00:00`).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => imprimir(i)}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

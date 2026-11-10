import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, FileUp, Rocket, Send, Store, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { primeirosPassosVisivel } from "@/lib/dp/primeiros-passos";

const PENDENTES = ["pendente", "revisar", "duplicado"];

/**
 * Primeiros passos do Pessoas 360° num balão próprio, aberto a cada visita ao
 * Início enquanto a equipe ainda está sendo trazida. Reconhece o lote de
 * fichas já enviado para continuar a conferência em vez de pedir novo envio.
 */
export function DpPrimeirosPassosCard() {
  const { selectedCompanyId } = useCompanyContext();
  const [aberto, setAberto] = useState(false);
  const { data } = useQuery({
    queryKey: ["dp-primeiros-passos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const cid = selectedCompanyId!;
      const [col, uni, pend, criados] = await Promise.all([
        supabase.from("dp_colaboradores").select("id", { count: "exact", head: true }).eq("company_id", cid),
        supabase.from("dp_unidades").select("id", { count: "exact", head: true }).eq("company_id", cid),
        supabase
          .from("dp_ficha_importacao_itens")
          .select("importacao_id, created_at")
          .eq("company_id", cid)
          .in("status", PENDENTES)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("dp_ficha_importacao_itens")
          .select("id", { count: "exact", head: true })
          .eq("company_id", cid)
          .in("status", ["criado", "atualizado"]),
      ]);
      if (col.error) throw col.error;
      const pendentes = pend.data ?? [];
      return {
        colaboradores: col.count ?? 0,
        unidades: uni.count ?? 0,
        fichasPendentes: pendentes.length,
        lotes: new Set(pendentes.map((p) => p.importacao_id)).size,
        loteId: (pendentes[0]?.importacao_id as string | undefined) ?? null,
        criadosPelasFichas: criados.count ?? 0,
      };
    },
  });

  const visivel = !!data && primeirosPassosVisivel(data);
  // Abre o balão a cada visita ao Início enquanto o cadastro da equipe está em andamento.
  useEffect(() => {
    if (visivel) setAberto(true);
  }, [visivel, selectedCompanyId]);

  if (!data || !visivel) return null;
  const temUnidade = data.unidades > 0;
  const emConferencia = data.fichasPendentes > 0;

  return (
    <>
      {!aberto && (
        <Button
          type="button"
          onClick={() => setAberto(true)}
          className="fixed bottom-[calc(76px+env(safe-area-inset-bottom)+0.75rem)] right-3 z-30 h-11 rounded-full shadow-lg md:bottom-6 md:right-6"
        >
          <Rocket className="mr-1.5 h-4 w-4" aria-hidden="true" /> Primeiros passos
        </Button>
      )}

      <ResponsiveDialog
        open={aberto}
        onOpenChange={setAberto}
        className="sm:max-w-md"
        title={<span className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" aria-hidden="true" /> Primeiros passos</span>}
        description={`Passo ${temUnidade ? 2 : 1} de 2`}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            {temUnidade
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              : <Store className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">1. Loja cadastrada</p>
              {!temUnidade && (
                <Button asChild size="sm" variant="outline" className="mt-2 h-10" onClick={() => setAberto(false)}>
                  <Link to="/dp/cadastros/unidades">Cadastrar loja</Link>
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">2. Traga sua equipe</p>
            {emConferencia ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {data.fichasPendentes} {data.fichasPendentes === 1 ? "ficha enviada aguarda" : "fichas enviadas aguardam"} conferência
                  {data.lotes > 1 ? ` em ${data.lotes} envios` : ""}
                  {data.criadosPelasFichas > 0 ? ` · ${data.criadosPelasFichas} já no cadastro` : ""}.
                </p>
                <Button asChild size="lg" className="h-12 w-full justify-start" onClick={() => setAberto(false)}>
                  <Link to={`/dp/colaboradores/importar-ficha${data.loteId ? `?lote=${data.loteId}` : ""}`}>
                    <ClipboardCheck className="mr-2 h-5 w-5" aria-hidden="true" /> Continuar conferência
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild size="lg" className="h-12 w-full justify-start" onClick={() => setAberto(false)}>
                <Link to="/dp/colaboradores/importar-ficha">
                  <FileUp className="mr-2 h-5 w-5" aria-hidden="true" />
                  <span className="flex flex-col items-start leading-tight">
                    <span>Importar Fichas de Registro</span>
                    <span className="text-xs font-normal opacity-90">Mais rápido: envie as fichas da contabilidade</span>
                  </span>
                </Link>
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" className="h-11" onClick={() => setAberto(false)}>
                <Link to="/dp/colaboradores/pre-admissoes"><Send className="mr-1.5 h-4 w-4" />Pré-Admissão</Link>
              </Button>
              <Button asChild variant="outline" className="h-11" onClick={() => setAberto(false)}>
                <Link to="/dp/colaboradores"><UserPlus className="mr-1.5 h-4 w-4" />Cadastro manual</Link>
              </Button>
            </div>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}

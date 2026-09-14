import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Scale, FileText, Phone, Mail, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CardListSkeleton } from "@/components/dp/DpSkeletons";

import { abrirArquivoDp } from "@/lib/dp/abrirDocumento";
import { toast } from "sonner";

type Negociacao = {
  id: string;
  tipo_documento: string | null;
  ano: number | null;
  mes: number | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  reajuste_pct: number | null;
  pdf_path: string | null;
  arquivo_nome: string | null;
  observacoes: string | null;
};

function dataBr(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

/** Tela do colaborador com o sindicato dele e os acordos/convenções vigentes. */
export default function DpMeuSindicato() {
  const { user } = useAuth();

  const colab = useQuery({
    queryKey: ["meu_sindicato_colab", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: id } = await supabase.rpc("dp_meu_colaborador");
      if (!id) return null;
      const { data } = await supabase
        .from("dp_colaboradores")
        .select("id, sindicato_id")
        .eq("id", id as string)
        .maybeSingle();
      return (data as { id: string; sindicato_id: string | null } | null) ?? null;
    },
  });

  const sindicatoId = colab.data?.sindicato_id ?? null;

  const sindicato = useQuery({
    queryKey: ["meu_sindicato", sindicatoId],
    enabled: !!sindicatoId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_sindicatos")
        .select("id, nome, cnpj, tipo, data_base, contato_nome, contato_email, contato_telefone")
        .eq("id", sindicatoId!)
        .maybeSingle();
      return data;
    },
  });

  const negociacoes = useQuery({
    queryKey: ["meu_sindicato_negociacoes", sindicatoId],
    enabled: !!sindicatoId,
    queryFn: async (): Promise<Negociacao[]> => {
      const { data } = await supabase
        .from("dp_sindicato_negociacoes")
        .select(
          "id, tipo_documento, ano, mes, vigencia_inicio, vigencia_fim, reajuste_pct, pdf_path, arquivo_nome, observacoes",
        )
        .eq("sindicato_id", sindicatoId!)
        .order("vigencia_inicio", { ascending: false, nullsFirst: false });
      return (data ?? []) as Negociacao[];
    },
  });

  const abrir = async (n: Negociacao) => {
    if (!n.pdf_path) {
      toast.info("Este acordo ainda não tem arquivo anexado");
      return;
    }
    const r = await abrirArquivoDp({
      bucket: "dp-documentos",
      path: n.pdf_path,
      mimeType: "application/pdf",
      fileName: n.arquivo_nome ?? undefined,
    });
    if (!r.ok) {
      toast.error(
        r.motivo === "bloqueado"
          ? "Seu navegador bloqueou a nova aba. Libere os pop-ups e tente de novo."
          : "Não foi possível abrir este arquivo agora",
      );
    }
  };

  const carregando = colab.isLoading || sindicato.isLoading || negociacoes.isLoading;

  return (
    <DpPage>
      <Helmet>
        <title>Meu Sindicato | Pessoas 360°</title>
        <meta name="description" content="Sindicato do colaborador e acordos coletivos vigentes." />
      </Helmet>

      <DpPageHeader
        icon={Scale}
        title="Sindicato"
        description="Seu sindicato e os acordos coletivos que valem para você"
      />

      <DpContentCard>
        {colab.isError || sindicato.isError ? (
          <DpErrorState onRetry={() => { colab.refetch(); sindicato.refetch(); }} />
        ) : carregando ? (
          <CardListSkeleton rows={1} />
        ) : !sindicato.data ? (
          <DpEmptyState icon={Scale}>
            Ainda não há sindicato registrado para você. Fale com o setor de pessoas.
          </DpEmptyState>

        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{sindicato.data.nome}</h2>
              {sindicato.data.tipo ? (
                <Badge variant="secondary">{String(sindicato.data.tipo)}</Badge>
              ) : null}
            </div>
            {sindicato.data.cnpj ? (
              <p className="text-sm text-muted-foreground">CNPJ {sindicato.data.cnpj}</p>
            ) : null}
            {sindicato.data.data_base ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" /> Data-base: {dataBr(sindicato.data.data_base)}
              </p>
            ) : null}
            {sindicato.data.contato_telefone ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" /> {sindicato.data.contato_telefone}
              </p>
            ) : null}
            {sindicato.data.contato_email ? (
              <p className="flex items-center gap-1.5 break-all text-sm text-muted-foreground">
                <Mail className="h-4 w-4" /> {sindicato.data.contato_email}
              </p>
            ) : null}
          </div>
        )}
      </DpContentCard>

      <DpContentCard>
        <h2 className="mb-2 text-base font-semibold">Acordos e convenções</h2>
        {negociacoes.isError ? (
          <DpErrorState onRetry={() => negociacoes.refetch()} />
        ) : carregando ? (
          <CardListSkeleton rows={2} />
        ) : (negociacoes.data ?? []).length === 0 ? (
          <DpEmptyState icon={FileText}>Nenhum acordo publicado até agora.</DpEmptyState>

        ) : (
          <ul className="divide-y">
            {(negociacoes.data ?? []).map((n) => {
              const periodo = [dataBr(n.vigencia_inicio), dataBr(n.vigencia_fim)]
                .filter(Boolean)
                .join(" a ");
              return (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {(n.tipo_documento ?? "ACT").toString().toUpperCase()}
                      {n.ano ? ` ${n.ano}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {periodo || "Vigência não informada"}
                      {n.reajuste_pct != null ? ` · reajuste ${n.reajuste_pct}%` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => abrir(n)}>
                    <FileText className="mr-1.5 h-4 w-4" /> Abrir
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DpContentCard>
    </DpPage>
  );
}

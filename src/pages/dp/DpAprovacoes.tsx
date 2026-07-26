import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCheck, Check, X, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DpPage, DpPageHeader, DpEmptyState } from "@/components/dp/DpPage";
import { MobileDetailsSheet } from "@/components/dp/MobileCardKit";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import { maskCpf } from "@/lib/cpf";
import type { Database } from "@/integrations/supabase/types";

type Solicitacao = Database["public"]["Tables"]["dp_cadastro_solicitacoes"]["Row"];

export default function DpAprovacoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recusarId, setRecusarId] = useState<string | null>(null);
  const [detailsRow, setDetailsRow] = useState<Solicitacao | null>(null);

  const listQuery = useQuery({
    queryKey: ["dp_cadastro_solicitacoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_cadastro_solicitacoes")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Solicitacao[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve, motivo }: { id: string; approve: boolean; motivo?: string }) => {
      const sol = listQuery.data?.find((s) => s.id === id);
      if (!sol) throw new Error("Solicitação não encontrada");

      if (approve) {
        // Cria colaborador aprovado a partir da solicitação
        const { error: insErr } = await supabase.from("dp_colaboradores").insert({
          company_id: sol.company_id,
          nome: sol.nome,
          cpf: sol.cpf,
          cargo: sol.cargo ?? "",
          email: sol.email,
          telefone: sol.telefone,
          data_nascimento: sol.data_nascimento,
          observacoes: sol.observacoes,
          ativo: true,
          aprovacao_status: "aprovado",
        });
        if (insErr) throw insErr;
      }

      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_cadastro_solicitacoes")
        .update({
          status: approve ? "aprovado" : "recusado",
          motivo_recusa: approve ? null : motivo ?? null,
          reviewed_by: userRes.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast({ title: vars.approve ? "Cadastro aprovado" : "Cadastro recusado" });
      qc.invalidateQueries({ queryKey: ["dp_cadastro_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      setBusyId(null);
      setRecusarId(null);
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setBusyId(null);
    },
  });

  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  return (
    <DpPage narrow>
      <Helmet><title>Aprovações de cadastro — DP 360°</title></Helmet>

      <DpPageHeader
        icon={UserCheck}
        title="Aprovações de cadastro"
        description="Novos colaboradores precisam ser aprovados antes de acessar o sistema."
      />

      <div className="space-y-3">
        {listQuery.isLoading && (
          <DpEmptyState dashed>Carregando…</DpEmptyState>
        )}

        {!listQuery.isLoading && items.length === 0 && (
          <DpEmptyState icon={Inbox} dashed>Nenhum cadastro pendente.</DpEmptyState>
        )}

        {items.map((p) => (
          <Card
            key={p.id}
            className="dp-content-card cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setDetailsRow(p)}
          >
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start gap-3 md:items-center md:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-semibold text-base truncate">{p.nome}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    CPF: {maskCpf(p.cpf)}
                    {p.cargo ? <> • {p.cargo}</> : null}
                  </div>
                  <div className="hidden md:block text-xs text-muted-foreground truncate">
                    {[p.email, p.telefone].filter(Boolean).join(" • ")}
                  </div>
                  <div className="hidden md:block text-xs text-muted-foreground">
                    Solicitado em {new Date(p.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                <div
                  className="flex shrink-0 gap-1 md:gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="outline"
                    aria-label="Recusar cadastro"
                    title="Recusar"
                    className="h-11 w-11 md:w-auto md:px-3"
                    disabled={busyId === p.id || decide.isPending}
                    onClick={() => setRecusarId(p.id)}
                  >
                    <X className="h-4 w-4 md:mr-1" />
                    <span className="hidden md:inline">Recusar</span>
                  </Button>
                  <Button
                    aria-label="Aprovar cadastro"
                    title="Aprovar"
                    className="h-11 w-11 md:w-auto md:px-3"
                    disabled={busyId === p.id || decide.isPending}
                    onClick={() => { setBusyId(p.id); decide.mutate({ id: p.id, approve: true }); }}
                  >
                    <Check className="h-4 w-4 md:mr-1" />
                    <span className="hidden md:inline">Aprovar</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <MobileDetailsSheet
        open={!!detailsRow}
        onOpenChange={(o) => !o && setDetailsRow(null)}
        title={detailsRow?.nome ?? "Cadastro"}
        description="Solicitação de cadastro pendente"
        meta={detailsRow ? [
          { label: "CPF", value: maskCpf(detailsRow.cpf) },
          ...(detailsRow.cargo ? [{ label: "Cargo", value: detailsRow.cargo }] : []),
          ...(detailsRow.email ? [{ label: "E-mail", value: detailsRow.email }] : []),
          ...(detailsRow.telefone ? [{ label: "Telefone", value: detailsRow.telefone }] : []),
          ...(detailsRow.data_nascimento ? [{ label: "Nascimento", value: detailsRow.data_nascimento }] : []),
          ...(detailsRow.observacoes ? [{ label: "Observações", value: detailsRow.observacoes }] : []),
          { label: "Solicitado em", value: new Date(detailsRow.created_at).toLocaleString("pt-BR") },
        ] : []}
        footer={detailsRow ? (
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setRecusarId(detailsRow.id); setDetailsRow(null); }}
            >
              <X className="h-4 w-4 mr-1" /> Recusar
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setBusyId(detailsRow.id);
                decide.mutate({ id: detailsRow.id, approve: true });
                setDetailsRow(null);
              }}
            >
              <Check className="h-4 w-4 mr-1" /> Aprovar
            </Button>
          </div>
        ) : null}
      />

      <RecusaDialog
        open={!!recusarId}
        onOpenChange={(v) => { if (!v) setRecusarId(null); }}
        title="Recusar cadastro"
        description="Informe o motivo da recusa. Ele ficará registrado no histórico da solicitação."
        motivoObrigatorio
        loading={decide.isPending}
        onConfirm={(motivo) => {
          if (!recusarId) return;
          setBusyId(recusarId);
          decide.mutate({ id: recusarId, approve: false, motivo });
        }}
      />
    </DpPage>
  );
}

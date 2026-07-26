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
          <Card key={p.id} className="dp-content-card">
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="font-semibold text-base">{p.nome}</div>
                  <div className="text-sm text-muted-foreground">
                    CPF: {maskCpf(p.cpf)}
                    {p.cargo ? <> • {p.cargo}</> : null}
                  </div>
                  {(p.email || p.telefone) && (
                    <div className="text-xs text-muted-foreground">
                      {[p.email, p.telefone].filter(Boolean).join(" • ")}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Solicitado em {new Date(p.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <Button
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={busyId === p.id || decide.isPending}
                    onClick={() => setRecusarId(p.id)}
                  >
                    <X className="h-4 w-4 mr-1" /> Recusar
                  </Button>
                  <Button
                    className="min-h-11 w-full sm:w-auto"
                    disabled={busyId === p.id || decide.isPending}
                    onClick={() => { setBusyId(p.id); decide.mutate({ id: p.id, approve: true }); }}
                  >
                    <Check className="h-4 w-4 mr-1" /> Aprovar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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

import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { UserCheck, Check, X, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DpPage, DpPageHeader, DpEmptyState } from "@/components/dp/DpPage";
import { MobileDetailsSheet } from "@/components/dp/MobileCardKit";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import { maskCpf } from "@/lib/cpf";
import { useDpAprovacoes, type DpCadastroSolicitacao } from "@/hooks/useDpAprovacoes";

type Solicitacao = DpCadastroSolicitacao;

export default function DpAprovacoes() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recusarId, setRecusarId] = useState<string | null>(null);
  const [detailsRow, setDetailsRow] = useState<Solicitacao | null>(null);

  const { items, isLoading, decidir } = useDpAprovacoes();

  const decide = {
    isPending: decidir.isPending,
    mutate: (vars: { id: string; approve: boolean; motivo?: string }) =>
      decidir.mutate(vars, {
        onSettled: () => {
          setBusyId(null);
          setRecusarId(null);
        },
      }),
  };

  const listQuery = { isLoading };


  return (
    <DpPage narrow>
      <Helmet><title>Aprovações de cadastro — Pessoas 360°</title></Helmet>

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

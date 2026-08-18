import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { Download, HeartHandshake, Printer, Receipt, Search, SlidersHorizontal, Wallet } from "lucide-react";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { FolhaDespesaDialog } from "@/components/dp/FolhaDespesaDialog";
import { FolhaRubricasDialog } from "@/components/dp/FolhaRubricasDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useDpFolhaPeriodo } from "@/hooks/useDpFolha";
import {
  FOLHA_TIPO_LABEL, LANCAMENTO_STATUS_LABEL, PERIODO_STATUS_LABEL,
  encargosDoLancamento, folhaParaCsv, formatarBRL, podeGerarDespesa, proximoStatusPeriodo, totaisDaFolha, totaisDosExtras,
  type FolhaPeriodoStatus,
} from "@/lib/dp/folha";
import { imprimirHolerite, type HoleriteDados } from "@/lib/dp/holerite";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";


const rotuloCompetencia = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const baixarCsv = (nome: string, conteudo: string) => {
  const url = URL.createObjectURL(new Blob(["\ufeff", conteudo], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
};

export default function DpFolhaPeriodo() {
  const { id } = useParams<{ id: string }>();
  const {
    periodo, linhas, transactionId, isLoading, error,
    alterarStatus, abonarAtestado, cancelarLancamento, gerarDespesa, desfazerDespesa, salvarRubricas,
  } = useDpFolhaPeriodo(id);
  const [busca, setBusca] = useState("");
  const [confirmar, setConfirmar] = useState<FolhaPeriodoStatus | null>(null);
  const [cancelar, setCancelar] = useState<string | null>(null);
  const [despesaAberta, setDespesaAberta] = useState(false);
  const [desfazerAberto, setDesfazerAberto] = useState(false);
  const [rubricasDe, setRubricasDe] = useState<string | null>(null);
  const [abonarDe, setAbonarDe] = useState<string | null>(null);
  const [abonoMotivo, setAbonoMotivo] = useState("");

  const filtradas = useMemo(
    () => linhas.filter((l) => !busca.trim() || l.nome.toLowerCase().includes(busca.trim().toLowerCase())),
    [linhas, busca],
  );
  const totais = useMemo(() => totaisDaFolha(linhas), [linhas]);

  const { companies, selectedCompanyId } = useCompanyContext();
  const empresa =
    companies.find((c) => c.id === selectedCompanyId)?.trade_name ||
    companies.find((c) => c.id === selectedCompanyId)?.name ||
    "360°FOOD";

  const imprimir = (alvo: typeof linhas) => {
    if (!periodo) return;
    const itens: HoleriteDados[] = alvo
      .filter((l) => l.status !== "cancelado")
      .map((l) => ({
        empresa,
        colaborador: l.nome,
        competencia: periodo.competencia,
        tipo: periodo.tipo,
        detalhe: l.detalhe,
        valorBruto: l.valor_bruto,
        valorLiquido: l.valor_liquido,
        dataPagamento: periodo.data_pagamento,
      }));
    const titulo = `Demonstrativos ${periodo.competencia.slice(0, 7)}`;
    if (!imprimirHolerite(titulo, itens)) {
      toast.error("Não foi possível abrir a impressão. Verifique o bloqueio de pop-ups.");
    }
  };

  if (error) return <DpErrorState message="Não foi possível carregar o período da folha." />;
  if (isLoading) return <DpPage><Skeleton className="h-64 w-full" /></DpPage>;
  if (!periodo) return <DpErrorState message="Período da folha não encontrado." />;

  const status = periodo.status as FolhaPeriodoStatus;
  const proximo = proximoStatusPeriodo(status);
  const competencia = periodo.competencia.slice(0, 7);

  return (
    <DpPage>
      <Helmet>
        <title>Folha {competencia} | Pessoas 360°FOOD</title>
        <meta name="description" content="Lançamentos da folha do período, com proventos, descontos e ciclo de aprovação." />
      </Helmet>

      <DpPageHeader
        title={`Folha de ${rotuloCompetencia(periodo.competencia)}`}
        description={`${FOLHA_TIPO_LABEL[periodo.tipo] ?? periodo.tipo} · ${PERIODO_STATUS_LABEL[status]}`}
        icon={Receipt}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dp/folha">Todos os Períodos</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!linhas.length}
              onClick={() => baixarCsv(`folha-${competencia}.csv`, folhaParaCsv(competencia, linhas))}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" disabled={!linhas.length} onClick={() => imprimir(linhas)}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Demonstrativos
            </Button>
            {status !== "aberto" && (
              <Button variant="outline" size="sm" onClick={() => setConfirmar("aberto")} disabled={alterarStatus.isPending}>
                Reabrir
              </Button>
            )}
            {podeGerarDespesa(status) && !transactionId && (
              <Button size="sm" variant="outline" onClick={() => setDespesaAberta(true)} disabled={gerarDespesa.isPending}>
                <Wallet className="mr-2 h-4 w-4" />
                Gerar Despesa no Financeiro
              </Button>
            )}
            {proximo && (
              <Button
                size="sm"
                disabled={!linhas.length || alterarStatus.isPending}
                onClick={() => setConfirmar(proximo)}
              >
                Avançar para {PERIODO_STATUS_LABEL[proximo]}
              </Button>
            )}
          </>
        }
      />

      {transactionId && (
        <DpContentCard className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Despesa lançada no financeiro</p>
            <p className="text-xs text-muted-foreground">
              Conta a pagar de {formatarBRL(totais.liquido)} vinculada a esta folha.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/lancamentos">Ver no Financeiro</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDesfazerAberto(true)} disabled={desfazerDespesa.isPending}>
              Desfazer
            </Button>
          </div>
        </DpContentCard>
      )}


      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <DpContentCard className="p-3">
          <p className="text-xs text-muted-foreground">Proventos</p>
          <p className="text-lg font-semibold">{formatarBRL(totais.bruto)}</p>
        </DpContentCard>
        <DpContentCard className="p-3">
          <p className="text-xs text-muted-foreground">Descontos</p>
          <p className="text-lg font-semibold">{formatarBRL(totais.descontos)}</p>
        </DpContentCard>
        <DpContentCard className="p-3">
          <p className="text-xs text-muted-foreground">Líquido</p>
          <p className="text-lg font-semibold">{formatarBRL(totais.liquido)}</p>
        </DpContentCard>
        <DpContentCard className="p-3">
          <p className="text-xs text-muted-foreground">Rascunhos</p>
          <p className="text-lg font-semibold">{totais.rascunho}</p>
        </DpContentCard>
      </div>

      <DpFilterCard>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar colaborador"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar colaborador"
          />
        </div>
      </DpFilterCard>

      <DpContentCard className="p-0">
        {!filtradas.length ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento neste período.</p>
        ) : (
          <ul className="divide-y">
            {filtradas.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{l.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Normais {formatarBRL(l.detalhe.proventos.normais)} · Extras{" "}
                    {formatarBRL(l.detalhe.proventos.extras50 + l.detalhe.proventos.extras100)} · Noturno{" "}
                    {formatarBRL(l.detalhe.proventos.noturno)} · Descontos{" "}
                    {formatarBRL(l.detalhe.faltas + l.detalhe.dsr)}
                    {l.detalhe.extras.length > 0 && (
                      <>
                        {" · Avulsas +"}
                        {formatarBRL(totaisDosExtras(l.detalhe.extras).proventos)}
                        {" / -"}
                        {formatarBRL(totaisDosExtras(l.detalhe.extras).descontos)}
                      </>
                    )}
                    {" · INSS "}
                    {formatarBRL(encargosDoLancamento(l.detalhe).inss)}
                    {" · IRRF "}
                    {formatarBRL(encargosDoLancamento(l.detalhe).irrf)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Líquido</p>
                    <p className="text-sm font-semibold">{formatarBRL(l.valor_liquido)}</p>
                  </div>
                  {l.atestado_abonado && (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                      Atestado abonado
                    </Badge>
                  )}
                  {l.status === "rascunho" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        l.atestado_abonado
                          ? `Remover abono de atestado de ${l.nome}`
                          : `Abonar atestado de ${l.nome}`
                      }
                      onClick={() => {
                        if (l.atestado_abonado) {
                          abonarAtestado.mutate({ id: l.id, abonado: false });
                          return;
                        }
                        setAbonoMotivo("");
                        setAbonarDe(l.id);
                      }}
                    >
                      <HeartHandshake className={`h-4 w-4 ${l.atestado_abonado ? "text-emerald-600" : ""}`} />
                    </Button>
                  )}
                  {l.status === "rascunho" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rubricas avulsas de ${l.nome}`}
                      onClick={() => setRubricasDe(l.id)}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Imprimir demonstrativo de ${l.nome}`}
                    disabled={l.status === "cancelado"}
                    onClick={() => imprimir([l])}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Badge variant={l.status === "rascunho" ? "secondary" : "default"}>
                    {LANCAMENTO_STATUS_LABEL[l.status]}
                  </Badge>
                  {l.status === "rascunho" && (
                    <Button variant="ghost" size="sm" onClick={() => setCancelar(l.id)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DpContentCard>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === "aberto" ? "Reabrir o período?" : "Avançar o status da folha?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === "aberto"
                ? "Os lançamentos voltam para rascunho e a apuração poderá ser reprocessada."
                : `Todos os lançamentos ativos passarão para "${confirmar ? PERIODO_STATUS_LABEL[confirmar] : ""}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmar) alterarStatus.mutate(confirmar);
                setConfirmar(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelar} onOpenChange={(o) => !o && setCancelar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O lançamento sai dos totais do período e não será pago. É possível gerar novamente pela apuração.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelar) cancelarLancamento.mutate(cancelar);
                setCancelar(null);
              }}
            >
              Cancelar Lançamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!abonarDe} onOpenChange={(o) => !o && setAbonarDe(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abonar o atestado deste mês?</AlertDialogTitle>
            <AlertDialogDescription>
              O prêmio de assiduidade será mantido mesmo com atestado apresentado. O abono é uma
              liberalidade da empresa e fica registrado com autor, data e motivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={abonoMotivo}
            onChange={(e) => setAbonoMotivo(e.target.value)}
            placeholder="Motivo do abono (ex.: atestado de acompanhamento de filho)"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (abonarDe) abonarAtestado.mutate({ id: abonarDe, abonado: true, motivo: abonoMotivo });
                setAbonarDe(null);
              }}
            >
              Abonar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FolhaRubricasDialog
        open={!!rubricasDe}
        onOpenChange={(o) => !o && setRubricasDe(null)}
        nome={linhas.find((l) => l.id === rubricasDe)?.nome ?? ""}
        extras={linhas.find((l) => l.id === rubricasDe)?.detalhe.extras ?? []}
        isPending={salvarRubricas.isPending}
        onConfirm={(extras) => {
          if (!rubricasDe) return;
          salvarRubricas.mutate({ id: rubricasDe, extras }, { onSuccess: () => setRubricasDe(null) });
        }}
      />

      <FolhaDespesaDialog
        open={despesaAberta}
        onOpenChange={setDespesaAberta}
        total={totais.liquido}
        competencia={competencia}
        dataPagamentoSugerida={periodo.data_pagamento}
        isPending={gerarDespesa.isPending}
        onConfirm={({ accountId, categoryId, dataPagamento }) => {
          gerarDespesa.mutate({ accountId, categoryId, dataPagamento }, { onSuccess: () => setDespesaAberta(false) });
        }}
      />

      <AlertDialog open={desfazerAberto} onOpenChange={setDesfazerAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer a despesa no financeiro?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta a pagar será excluída e o vínculo com os contracheques removido. Só é possível enquanto ela
              estiver pendente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                desfazerDespesa.mutate();
                setDesfazerAberto(false);
              }}
            >
              Desfazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>

  );
}

// Relação de adiantamento salarial por competência e unidade: quem recebe,
// novas adesões, suspensões e situação do termo, com PDF/planilha para a
// contabilidade. Aberta pelos avisos de adiantamento e pela unidade.
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, HandCoins, Loader2 } from "lucide-react";
import { DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import {
  competenciaDoProximoPagamento, limitePedidoPortal, pagamentoNaCompetencia,
  rotuloCompetencia, rotuloDiaMes, somarCompetencia,
} from "@/lib/dp/adiantamento-opcao";
import {
  SITUACAO_LABEL, TERMO_LABEL, baixarArquivo, carregarRelacao, contaTexto, gerarRelacaoPdf,
  relacaoCsv, resumoRelacao, termoPendente, type LinhaRelacao,
} from "@/lib/dp/adiantamento-relacao";
import { cpfFmt } from "@/lib/dp/termos-freelancer";
import { cn } from "@/lib/utils";

const TODAS = "todas";
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

function Contador({ rotulo, valor, destaque }: { rotulo: string; valor: number | string; destaque?: boolean }) {
  return <div className={cn("rounded-xl border p-3", destaque ? "border-warning/40 bg-warning/10" : "bg-muted/30")}>
    <p className="text-xs text-muted-foreground">{rotulo}</p>
    <p className="text-xl font-bold tabular-nums">{valor}</p>
  </div>;
}

function LinhaCard({ l, mostrarUnidade }: { l: LinhaRelacao; mostrarUnidade: boolean }) {
  const suspenso = l.situacao === "cancelado";
  return <li className={cn("rounded-xl border p-3", suspenso && "bg-muted/40")}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate font-semibold">{l.nome}</p>
        <p className="truncate text-xs text-muted-foreground">{[l.cargo, mostrarUnidade ? l.unidade_nome : null].filter(Boolean).join(" · ")}</p>
      </div>
      <Badge variant={suspenso ? "secondary" : l.situacao === "nova_adesao" ? "default" : "outline"} className="shrink-0">
        {SITUACAO_LABEL[l.situacao]}
      </Badge>
    </div>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      <div><dt className="text-muted-foreground">CPF</dt><dd>{l.liberado ? cpfFmt(l.cpf) ?? "—" : "Sem permissão"}</dd></div>
      <div><dt className="text-muted-foreground">Salário base</dt><dd>{l.liberado ? brl(l.salario_base) : "Sem permissão"}</dd></div>
      <div className="col-span-2"><dt className="text-muted-foreground">Pagamento</dt>
        <dd className="break-words">{!l.liberado ? "Sem permissão" : [contaTexto(l), l.pix_chave ? `Pix ${l.pix_chave}` : null].filter(Boolean).join(" · ") || "Não informado"}</dd>
      </div>
    </dl>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {!suspenso && l.termo_situacao && (
        <Badge variant="outline" className={cn(termoPendente(l.termo_situacao) && "border-warning/50 text-warning")}>{TERMO_LABEL[l.termo_situacao]}</Badge>
      )}
      {l.mudanca_data && (
        <span className="text-muted-foreground">
          {suspenso ? "Suspendeu" : "Pediu"} em {rotuloDiaMes(l.mudanca_data)} · {l.mudanca_origem === "portal" ? "pelo portal" : "pelo gestor"}
        </span>
      )}
    </div>
  </li>;
}

export default function DpAdiantamentosRelacao() {
  const [params, setParams] = useSearchParams();
  const { selectedCompanyId, companies } = useCompanyContext();
  const empresa = companies.find((c) => c.id === selectedCompanyId);
  const unidadesQ = useDpUnidades();
  const unidades = useMemo(
    () => (unidadesQ.data ?? []).filter((u) => u.company_id === selectedCompanyId && u.tem_adiantamento && u.dia_adiantamento),
    [unidadesQ.data, selectedCompanyId],
  );

  // Aviso de pedido: abre a competência e a unidade daquele pedido.
  const solicitacaoId = params.get("solicitacao");
  const solicitacaoQ = useQuery({
    queryKey: ["dp_adiantamento_solicitacao_ref", solicitacaoId],
    enabled: !!solicitacaoId,
    queryFn: async () => {
      const { data } = await supabase.from("dp_adiantamento_solicitacoes")
        .select("competencia_efeito, dp_colaboradores(unidade_id)").eq("id", solicitacaoId!).maybeSingle();
      return data as { competencia_efeito: string; dp_colaboradores: { unidade_id: string | null } | null } | null;
    },
  });
  useEffect(() => {
    const s = solicitacaoQ.data;
    if (!s) return;
    const p = new URLSearchParams(params);
    p.delete("solicitacao");
    p.set("competencia", s.competencia_efeito);
    if (s.dp_colaboradores?.unidade_id) p.set("unidade", s.dp_colaboradores.unidade_id);
    setParams(p, { replace: true });
  }, [solicitacaoQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const unidadeParam = params.get("unidade");
  const unidadeId = unidadeParam && unidades.some((u) => u.id === unidadeParam) ? unidadeParam : unidades.length === 1 ? unidades[0].id : TODAS;
  const unidade = unidades.find((u) => u.id === unidadeId) ?? null;
  const diaRef = unidade?.dia_adiantamento ?? unidades[0]?.dia_adiantamento ?? 15;
  const compParam = params.get("competencia");
  const competencia = compParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(compParam) ? compParam : competenciaDoProximoPagamento(hoje(), diaRef);

  const mudar = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p, { replace: true });
  };

  const relacaoQ = useQuery({
    queryKey: ["dp_adiantamento_relacao", selectedCompanyId, competencia, unidadeId],
    enabled: !!selectedCompanyId && !solicitacaoId,
    queryFn: () => carregarRelacao(selectedCompanyId!, competencia, unidadeId === TODAS ? null : unidadeId),
  });
  const linhas = relacaoQ.data ?? [];
  const recebem = linhas.filter((l) => l.situacao !== "cancelado");
  const suspensos = linhas.filter((l) => l.situacao === "cancelado");
  const resumo = resumoRelacao(linhas);
  const algumSemPermissao = linhas.some((l) => !l.liberado);

  const [baixando, setBaixando] = useState<"pdf" | "csv" | null>(null);
  const meta = {
    empresa: empresa ? (empresa.trade_name || empresa.name) : "Empresa",
    cnpj: (empresa as { cnpj?: string | null } | undefined)?.cnpj ?? null,
    unidade: unidade ? unidade.nome : "Todas as unidades",
    competencia,
  };
  const nomeArquivo = `relacao-adiantamento-${competencia}${unidade ? `-${unidade.nome.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-")}` : ""}`;
  const baixar = async (tipo: "pdf" | "csv") => {
    setBaixando(tipo);
    try {
      if (tipo === "pdf") baixarArquivo(`${nomeArquivo}.pdf`, (await gerarRelacaoPdf(linhas, meta)) as BlobPart, "application/pdf");
      else baixarArquivo(`${nomeArquivo}.csv`, "\ufeff" + relacaoCsv(linhas, meta), "text/csv;charset=utf-8");
    } catch {
      toast.error("Não foi possível gerar o arquivo. Tente novamente.");
    } finally {
      setBaixando(null);
    }
  };

  const prazoTexto = unidade
    ? `Pagamento em ${rotuloDiaMes(pagamentoNaCompetencia(competencia, unidade.dia_adiantamento))} · pedidos pelo portal até ${rotuloDiaMes(limitePedidoPortal(competencia, unidade.dia_adiantamento, unidade.adiantamento_antecedencia_dias))}`
    : "Pagamento e prazo conforme cada unidade";

  return <DpPage narrow>
    <Helmet><title>Relação de adiantamento | Pessoas 360°</title></Helmet>
    <DpPageHeader icon={HandCoins} title="Relação de adiantamento" description="Quem recebe o adiantamento salarial no mês, pronto para enviar à contabilidade." />

    <section className="space-y-3 rounded-2xl border bg-card p-3 sm:p-4" aria-label="Filtros da relação">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Mês anterior" onClick={() => mudar({ competencia: somarCompetencia(competencia, -1) })}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="text-base font-semibold first-letter:uppercase">{rotuloCompetencia(competencia)}</p>
          <p className="text-xs text-muted-foreground">{prazoTexto}</p>
        </div>
        <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Próximo mês" onClick={() => mudar({ competencia: somarCompetencia(competencia, 1) })}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {unidades.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="relacao-unidade" className="text-xs text-muted-foreground">Unidade</Label>
          <Select value={unidadeId} onValueChange={(v) => mudar({ unidade: v === TODAS ? null : v })}>
            <SelectTrigger id="relacao-unidade" className="min-h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as unidades</SelectItem>
              {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button className="min-h-11" disabled={!linhas.length || !!baixando || relacaoQ.isLoading} onClick={() => void baixar("pdf")}>
          {baixando === "pdf" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />} Baixar PDF
        </Button>
        <Button variant="outline" className="min-h-11" disabled={!linhas.length || !!baixando || relacaoQ.isLoading} onClick={() => void baixar("csv")}>
          {baixando === "csv" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4" />} Planilha
        </Button>
      </div>
    </section>

    {relacaoQ.isError ? (
      <DpErrorState message="Não foi possível carregar a relação." onRetry={() => relacaoQ.refetch()} />
    ) : relacaoQ.isLoading || solicitacaoQ.isLoading || unidadesQ.isLoading ? (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">Carregando relação…</p>
    ) : !unidades.length ? (
      <DpEmptyState icon={HandCoins} dashed>Nenhuma unidade oferece adiantamento salarial. Ative no cadastro da unidade.</DpEmptyState>
    ) : <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Contador rotulo="Recebem" valor={resumo.recebem} />
        <Contador rotulo="Novas adesões" valor={resumo.novas} />
        <Contador rotulo="Suspensões" valor={resumo.suspensos} />
        <Contador rotulo="Termos pendentes" valor={resumo.termosPendentes} destaque={resumo.termosPendentes > 0} />
      </div>
      {algumSemPermissao && (
        <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">CPF, salário e dados de pagamento aparecem só para quem pode ver salários.</p>
      )}
      {!linhas.length ? (
        <DpEmptyState icon={HandCoins} dashed>Ninguém optou pelo adiantamento em {rotuloCompetencia(competencia)}.</DpEmptyState>
      ) : <>
        {recebem.length > 0 && <section className="space-y-2" aria-labelledby="relacao-recebem">
          <h2 id="relacao-recebem" className="text-sm font-semibold">Recebem ({recebem.length})</h2>
          <ul className="grid gap-2 md:grid-cols-2">{recebem.map((l) => <LinhaCard key={l.colaborador_id} l={l} mostrarUnidade={!unidade} />)}</ul>
        </section>}
        {suspensos.length > 0 && <section className="space-y-2" aria-labelledby="relacao-suspensos">
          <h2 id="relacao-suspensos" className="text-sm font-semibold">Suspenderam a partir deste mês ({suspensos.length})</h2>
          <ul className="grid gap-2 md:grid-cols-2">{suspensos.map((l) => <LinhaCard key={l.colaborador_id} l={l} mostrarUnidade={!unidade} />)}</ul>
        </section>}
      </>}
    </>}
  </DpPage>;
}

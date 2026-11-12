// Adiantamento salarial no portal: situação, prazo e atalho para pedir ou
// suspender. Ativar exige ler e assinar o Termo de Opção (fluxo oficial);
// o servidor confere o prazo da unidade e a assinatura antes de gravar.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DocumentoAssinarViewer } from "@/components/dp/portal/DocumentoAssinarViewer";
import { assinarDocumento } from "@/lib/dp/documentoAceite";
import {
  TERMO_ADIANTAMENTO_TITULO, descartarTermoPortal, gerarTermoAdiantamentoPdf,
  guardarArquivoTermo, prepararTermoPortal, solicitarAdiantamentoPortal,
} from "@/lib/dp/adiantamento-termo";
import { rotuloCompetencia, rotuloDiaMes } from "@/lib/dp/adiantamento-opcao";
import { MEU_ADIANTAMENTO_KEY, useMeuAdiantamento, type MeuAdiantamento } from "@/hooks/useMeuAdiantamento";
import { cn } from "@/lib/utils";

type Info = Extract<MeuAdiantamento, { disponivel: true }>;

/** Frases da situação, compartilhadas pelo cartão do perfil e pelo calendário. */
export function textosAdiantamento(i: Info) {
  const dentroDoPrazo = i.hoje <= i.limite_atual;
  const mudancaAgendada = i.ativo_pedido !== i.ativo_atual && i.competencia_pedido !== i.competencia_atual;
  const status = i.ativo_atual
    ? `Ativo · recebe em ${rotuloDiaMes(i.pagamento_atual)}`
    : `Desligado · sem adiantamento em ${rotuloDiaMes(i.pagamento_atual)}`;
  let prazo: string;
  if (mudancaAgendada) {
    prazo = i.ativo_pedido
      ? `Pedido registrado: passa a receber a partir de ${rotuloCompetencia(i.competencia_pedido)}.`
      : `Suspensão registrada: deixa de receber a partir de ${rotuloCompetencia(i.competencia_pedido)}.`;
  } else if (dentroDoPrazo) {
    prazo = i.ativo_atual
      ? `Para suspender neste mês, peça até ${rotuloDiaMes(i.limite_atual)}.`
      : `Para receber em ${rotuloDiaMes(i.pagamento_atual)}, peça até ${rotuloDiaMes(i.limite_atual)}.`;
  } else {
    prazo = `O prazo deste mês terminou em ${rotuloDiaMes(i.limite_atual)}. Pedidos feitos hoje valem a partir de ${rotuloCompetencia(i.competencia_pedido)}.`;
  }
  return { status, prazo, mudancaAgendada, acao: i.ativo_pedido ? "suspender" : "solicitar" as "suspender" | "solicitar" };
}

/** Pedido de ativação (com termo) ou suspensão. */
export function AdiantamentoPedidoFluxo({
  info, acao, open, onOpenChange,
}: { info: Info; acao: "solicitar" | "suspender"; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [termo, setTermo] = useState<{ id: string; path: string } | null>(null);
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: MEU_ADIANTAMENTO_KEY });
    qc.invalidateQueries({ queryKey: ["dp_portal_meus_pagamentos"] });
    qc.invalidateQueries({ queryKey: ["dp_meus_documentos_unified"] });
  };

  const preparar = useMutation({
    mutationFn: async () => {
      const bytes = await gerarTermoAdiantamentoPdf(
        { empresa: info.empresa ?? "Empresa", cnpj: info.cnpj, unidade: info.unidade, nome: info.nome, cpf: info.cpf, cargo: info.cargo },
        { dia: info.dia, antecedencia: info.antecedencia, competencia: info.competencia_pedido },
        false,
      );
      const { path, size } = await guardarArquivoTermo(info.company_id, info.colaborador_id, bytes);
      const id = await prepararTermoPortal(path, size);
      return { id, path };
    },
    onSuccess: (t) => { onOpenChange(false); setTermo(t); },
    onError: (e: Error) => toast.error(e.message),
  });

  const concluirAtivacao = useMutation({
    mutationFn: async (assinatura: string) => {
      if (!termo) throw new Error("Termo não encontrado.");
      await assinarDocumento(termo.id, assinatura);
      return solicitarAdiantamentoPortal("ativar", termo.id);
    },
    onSuccess: (r) => {
      setTermo(null);
      atualizar();
      toast.success("Adiantamento solicitado", {
        description: `Vale a partir de ${rotuloCompetencia(r.competencia_efeito)} e continua nos meses seguintes até você pedir a suspensão. O termo assinado fica em Meus Documentos.`,
      });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível concluir o pedido."),
  });

  const suspender = useMutation({
    mutationFn: () => solicitarAdiantamentoPortal("cancelar"),
    onSuccess: (r) => {
      onOpenChange(false);
      atualizar();
      toast.success("Suspensão registrada", { description: `Sem adiantamento a partir de ${rotuloCompetencia(r.competencia_efeito)}.` });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fecharViewer = (v: boolean) => {
    if (v || !termo) return;
    if (!concluirAtivacao.isPending) {
      void descartarTermoPortal(termo.id);
      setTermo(null);
    }
  };

  const comp = rotuloCompetencia(info.competencia_pedido);
  const ocupado = preparar.isPending || suspender.isPending;
  return <>
    <AlertDialog open={open} onOpenChange={(v) => !ocupado && onOpenChange(v)}>
      <AlertDialogContent className="w-[calc(100%-1rem)] max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{acao === "solicitar" ? "Solicitar adiantamento salarial" : "Suspender adiantamento salarial"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {acao === "solicitar" ? <>
                <p>Você passa a receber o adiantamento no dia {info.dia}, a partir de <strong>{comp}</strong>.</p>
                <p><strong>O adiantamento continua ativo nos meses seguintes</strong>, sem precisar pedir de novo, até você pedir a suspensão.</p>
                <p>O valor é descontado do salário do mesmo mês. Para concluir, leia e assine o termo de opção.</p>
              </> : <>
                <p>Você deixa de receber o adiantamento a partir de <strong>{comp}</strong>.</p>
                <p>Pode voltar a pedir quando quiser, respeitando o prazo de {info.antecedencia} {info.antecedencia === 1 ? "dia" : "dias"} antes do pagamento.</p>
              </>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={ocupado}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={ocupado}
            onClick={(e) => { e.preventDefault(); acao === "solicitar" ? preparar.mutate() : suspender.mutate(); }}
          >
            {ocupado && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {acao === "solicitar" ? "Ler e assinar o termo" : "Confirmar suspensão"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <DocumentoAssinarViewer
      open={!!termo}
      onOpenChange={fecharViewer}
      titulo={TERMO_ADIANTAMENTO_TITULO}
      filePath={termo?.path ?? null}
      fileName="termo-opcao-adiantamento.pdf"
      mimeType="application/pdf"
      nomeColaborador={info.nome}
      enviando={concluirAtivacao.isPending}
      onConcluir={(png) => concluirAtivacao.mutate(png)}
    />
  </>;
}

/** Linha compacta com situação, prazo e botão (calendário, perfil). */
export function AdiantamentoPortalAcao({ info, className, compacto }: { info: Info; className?: string; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const t = textosAdiantamento(info);
  return <div className={cn("space-y-2", className)}>
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={info.ativo_atual ? "default" : "secondary"}>{info.ativo_atual ? "Ativo" : "Desligado"}</Badge>
      <span className="text-sm text-foreground">{t.status.split(" · ")[1]}</span>
    </div>
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{t.prazo}</span>
    </p>
    {!compacto && !info.ativo_pedido && (
      <p className="text-xs text-muted-foreground">Uma vez ativado, continua nos meses seguintes até você pedir a suspensão.</p>
    )}
    <Button
      type="button"
      size="sm"
      variant={t.acao === "solicitar" ? "default" : "outline"}
      className="min-h-11 w-full sm:w-auto"
      onClick={() => setAberto(true)}
    >
      {t.acao === "solicitar" ? "Solicitar adiantamento" : "Suspender adiantamento"}
    </Button>
    <AdiantamentoPedidoFluxo info={info} acao={t.acao} open={aberto} onOpenChange={setAberto} />
  </div>;
}

/** Cartão do Meu Perfil: some quando a unidade ou o vínculo não têm adiantamento. */
export function AdiantamentoPortalCard() {
  const q = useMeuAdiantamento();
  if (!q.data?.disponivel) return null;
  return <Card className="dp-content-card" id="adiantamento">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base">
        <Banknote className="h-4 w-4 text-primary" aria-hidden /> Adiantamento salarial
      </CardTitle>
    </CardHeader>
    <CardContent><AdiantamentoPortalAcao info={q.data} /></CardContent>
  </Card>;
}

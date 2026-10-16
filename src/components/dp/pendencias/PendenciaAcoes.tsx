import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Ban, CalendarPlus, Check, FileUp, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDpPendenciasDecisoes } from "@/hooks/useDpPendenciasDecisoes";
import { useDpIntermitenteConfirmacoes } from "@/hooks/useDpIntermitenteConfirmacoes";
import type { Pendencia } from "@/hooks/useDpPendencias";
import { DpLicencaRetornoDialog } from "@/components/dp/licencas/DpLicencaRetornoDialog";
import { adiarPresets } from "@/lib/dp/adiar-presets";
import { DpDocumentoImportarDialog, alvoImportacao } from "@/components/dp/documentos/DpDocumentoImportarDialog";
import { FeriasNovoModal } from "@/components/dp/ferias/FeriasNovoModal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { porIds, resolverPendencias } from "@/lib/dp/pendencias-resolver";
import { registrarResolvida } from "@/lib/dp/resolvidas-hoje";

/** Pedidos que exigem decisões extras (assiduidade, evento) ficam na tela própria. */
const SOLICITACAO_NA_TELA_PROPRIA = /atestado|licen|adiantamento|outro/i;

/** Rótulo do botão principal conforme o assunto (em vez do genérico "Resolver"). */
const ROTULO: Record<string, string> = {
  "Férias": "Programar férias",
  "Assinaturas": "Ver assinatura",
  "Documentos": "Enviar documento",
  "Comprovante de pagamento": "Anexar comprovante",
  "Cadastro de Colaborador": "Completar cadastro",
  "Dependente": "Ver dependente",
  "Escala": "Abrir escala",
  "Troca": "Analisar troca",
  "Solicitação": "Analisar pedido",
  "Ocorrência": "Tratar ocorrência",
  "Rescisão": "Ver desligamento",
  "Pré-Admissão": "Ver pré-admissão",
  "Benefícios": "Ver benefícios",
};

/**
 * Ações compartilhadas de uma pendência: resolver, adiar ou ignorar para toda a
 * empresa (com justificativa). No alerta do intermitente, troca o "resolver"
 * pela resposta direta do gestor: trabalhou ou não trabalhou.
 */
export function PendenciaAcoes({
  pendencia: p,
  onNavigate,
  onResolved,
}: {
  pendencia: Pendencia;
  onNavigate?: () => void;
  onResolved?: () => void;
}) {
  const { decidir, remover, decisaoDe } = useDpPendenciasDecisoes();
  const { responder } = useDpIntermitenteConfirmacoes();
  const [ignorarAberto, setIgnorarAberto] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [adiarAberto, setAdiarAberto] = useState(false);
  const [retornoAberto, setRetornoAberto] = useState(false);
  const [feriasAberto, setFeriasAberto] = useState(false);
  const [importarAberto, setImportarAberto] = useState(false);
  const importarNaTela = !!alvoImportacao(p.url);
  const feriasNaTela = p.tipo === "Férias" && !!p.colaboradorId;

  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const [recusarAberto, setRecusarAberto] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const trocaNaTela = p.tipo === "Troca" && !!p.trocaId;
  const solicitacaoNaTela = p.tipo === "Solicitação" && !!p.solicitacao && !SOLICITACAO_NA_TELA_PROPRIA.test(p.solicitacao.tipo);

  const concluir = () => {
    if (selectedCompanyId) registrarResolvida(selectedCompanyId, p.id);
    void resolverPendencias(qc, { companyId: selectedCompanyId, match: porIds([p.id]) });
    onResolved?.();
  };

  const decidirDireto = useMutation({
    mutationFn: async ({ aceito, obs }: { aceito: boolean; obs?: string }) => {
      if (trocaNaTela) {
        const { error } = await supabase.rpc("dp_troca_responder_gestor", {
          p_id: p.trocaId!, p_aceito: aceito, p_observacao: obs?.trim() || null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("dp_solicitacao_responder", {
          p_id: p.solicitacao!.id, p_status: aceito ? "aprovada" : "recusada", p_resposta: (obs?.trim() || null) as any,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.aceito ? "Aprovado" : "Recusado");
      setRecusarAberto(false);
      setMotivoRecusa("");
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_trocas"] });
      concluir();
    },
    onError: (e: any) => toast.error("Não foi possível registrar a decisão", {
      description: `${e?.message ?? "Erro"} — tente de novo ou abra a tela de Folgas.`,
    }),
  });

  const decisao = decisaoDe.get(p.id);
  const intermitente = p.tipo === "Intermitente" && !!p.colaboradorId && !!p.competencia;
  const licencaRetorno = p.tipo === "Licença" && !!p.licenca;


  const adiar = (data: string) => {
    setAdiarAberto(false);
    decidir.mutate({ pendenciaId: p.id, tipo: p.tipo, acao: "adiar", adiadaAte: data });
  };

  const confirmarIgnorar = () => {
    decidir.mutate(
      { pendenciaId: p.id, tipo: p.tipo, acao: "ignorar", justificativa },
      {
        onSuccess: () => {
          setIgnorarAberto(false);
          setJustificativa("");
        },
      },
    );
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {intermitente ? (
        <>
          <Button
            size="sm"
            className="h-9 sm:h-7 text-xs"
            disabled={responder.isPending}
            onClick={() =>
              responder.mutate(
                {
                  colaboradorId: p.colaboradorId!,
                  competencia: p.competencia!,
                  trabalhou: true,
                },
                { onSuccess: concluir },
              )
            }
          >
            <Check className="h-3 w-3 mr-1" /> Trabalhou
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 sm:h-7 text-xs"
            disabled={responder.isPending}
            onClick={() =>
              responder.mutate(
                {
                  colaboradorId: p.colaboradorId!,
                  competencia: p.competencia!,
                  trabalhou: false,
                },
                { onSuccess: concluir },
              )
            }
          >
            <X className="h-3 w-3 mr-1" /> Não trabalhou
          </Button>
        </>
      ) : trocaNaTela || solicitacaoNaTela ? (
        <>
          <Button size="sm" className="h-9 sm:h-7 text-xs" disabled={decidirDireto.isPending}
            onClick={() => decidirDireto.mutate({ aceito: true })}>
            <Check className="h-3 w-3 mr-1" /> Aprovar
          </Button>
          <Button size="sm" variant="outline" className="h-9 sm:h-7 text-xs" disabled={decidirDireto.isPending}
            onClick={() => setRecusarAberto(true)}>
            <X className="h-3 w-3 mr-1" /> Recusar
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-9 sm:h-7 text-xs">
            <Link to={p.url} onClick={onNavigate}>Detalhes <ArrowRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        </>
      ) : licencaRetorno ? (
        <Button size="sm" className="h-9 sm:h-7 text-xs" onClick={() => setRetornoAberto(true)}>
          <Check className="h-3 w-3 mr-1" /> Registrar retorno
        </Button>
      ) : feriasNaTela ? (
        <Button size="sm" className="h-9 sm:h-7 text-xs" onClick={() => setFeriasAberto(true)}>
          <CalendarPlus className="h-3 w-3 mr-1" /> Programar férias
        </Button>
      ) : importarNaTela ? (
        <Button size="sm" className="h-9 sm:h-7 text-xs" onClick={() => setImportarAberto(true)}>
          <FileUp className="h-3 w-3 mr-1" /> Importar documento
        </Button>
      ) : (
        <Button asChild size="sm" className="h-9 sm:h-7 text-xs">
          <Link to={p.url} onClick={onNavigate}>
            {ROTULO[p.tipo] ?? "Resolver"} <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      )}


      {decisao ? (
        <Button
          size="sm"
          variant="outline"
          className="h-9 sm:h-7 text-xs"
          disabled={remover.isPending}
          onClick={() => remover.mutate(p.id)}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          {decisao.acao === "ignorar" ? "Voltar a cobrar" : "Remover adiamento"}
        </Button>
      ) : (
        <>
          <Popover open={adiarAberto} onOpenChange={setAdiarAberto}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 sm:h-7 text-xs">
                <CalendarPlus className="h-3 w-3 mr-1" /> Adiar
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Lembrar todos os gestores em
              </p>
              <div className="grid gap-1">
                {adiarPresets().map((op) => (
                  <Button
                    key={op.chave}
                    size="sm"
                    variant="outline"
                    className="h-10 sm:h-8 justify-between text-xs"
                    disabled={decidir.isPending}
                    onClick={() => adiar(op.data)}
                  >
                    <span>{op.label}</span>
                    <span className="text-muted-foreground">
                      {new Date(op.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            variant="ghost"
            className="h-9 sm:h-7 text-xs text-muted-foreground"
            onClick={() => setIgnorarAberto(true)}
          >
            <Ban className="h-3 w-3 mr-1" /> Ignorar
          </Button>
        </>
      )}

      <Dialog open={ignorarAberto} onOpenChange={setIgnorarAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ignorar pendência</DialogTitle>
            <DialogDescription>
              A pendência deixa de aparecer para todos os gestores da empresa. A justificativa fica
              registrada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-1">
            <Label>
              Justificativa <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={4}
              autoFocus
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: documento não se aplica a este colaborador nesta competência."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIgnorarAberto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={justificativa.trim().length < 3 || decidir.isPending}
              onClick={confirmarIgnorar}
            >
              {decidir.isPending ? "Salvando…" : "Ignorar pendência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recusarAberto} onOpenChange={setRecusarAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar {trocaNaTela ? "troca" : "pedido"}</DialogTitle>
            <DialogDescription>O colaborador verá o motivo informado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-1">
            <Label>Motivo <span className="text-destructive">*</span></Label>
            <Textarea rows={3} autoFocus value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)}
              placeholder="Ex.: dia de pico, sem cobertura na equipe." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusarAberto(false)}>Cancelar</Button>
            <Button disabled={motivoRecusa.trim().length < 3 || decidirDireto.isPending}
              onClick={() => decidirDireto.mutate({ aceito: false, obs: motivoRecusa })}>
              {decidirDireto.isPending ? "Salvando…" : "Recusar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {feriasNaTela && feriasAberto && (
        <FeriasNovoModal
          open={feriasAberto}
          onOpenChange={(o) => {
            setFeriasAberto(o);
            if (!o) onResolved?.();
          }}
          colaboradorId={p.colaboradorId!}
        />
      )}

      {importarNaTela && importarAberto && (
        <DpDocumentoImportarDialog
          url={p.url}
          open={importarAberto}
          onOpenChange={(o) => {
            setImportarAberto(o);
            if (!o) onResolved?.();
          }}
        />
      )}

      {licencaRetorno && (
        <DpLicencaRetornoDialog
          alvo={{ ...p.licenca!, colaboradorNome: p.colaboradorNome ?? null }}
          open={retornoAberto}
          onOpenChange={setRetornoAberto}
          onResolved={onResolved}
        />
      )}
    </div>

  );
}

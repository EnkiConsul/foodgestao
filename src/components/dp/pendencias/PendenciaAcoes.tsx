import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Ban, CalendarPlus, Check, RotateCcw, X } from "lucide-react";
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
import { addDays, format } from "date-fns";

const ADIAR_PRESETS = [7, 15, 30];

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

  const decisao = decisaoDe.get(p.id);
  const intermitente = p.tipo === "Intermitente" && !!p.colaboradorId && !!p.competencia;
  const licencaRetorno = p.tipo === "Licença" && !!p.licenca;


  const adiar = (dias: number) => {
    setAdiarAberto(false);
    decidir.mutate({
      pendenciaId: p.id,
      tipo: p.tipo,
      acao: "adiar",
      adiadaAte: format(addDays(new Date(), dias), "yyyy-MM-dd"),
    });
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
                { onSuccess: onResolved },
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
                { onSuccess: onResolved },
              )
            }
          >
            <X className="h-3 w-3 mr-1" /> Não trabalhou
          </Button>
        </>
      ) : licencaRetorno ? (
        <Button size="sm" className="h-9 sm:h-7 text-xs" onClick={() => setRetornoAberto(true)}>
          <Check className="h-3 w-3 mr-1" /> Registrar retorno
        </Button>
      ) : (
        <Button asChild size="sm" className="h-9 sm:h-7 text-xs">
          <Link to={p.url} onClick={onNavigate}>
            Resolver <ArrowRight className="h-3 w-3 ml-1" />
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
            <PopoverContent align="end" className="w-56 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Adiar para todos os gestores por
              </p>
              <div className="flex gap-1">
                {ADIAR_PRESETS.map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 text-xs"
                    onClick={() => adiar(d)}
                  >
                    {d}d
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

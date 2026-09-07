import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, EyeOff, ThumbsUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDpAvisoEngajamento } from "@/hooks/useDpMural";

export function AvisoEngajamentoDialog({
  avisoId,
  titulo,
  totalColaboradores,
  onOpenChange,
}: {
  avisoId: string | null;
  titulo?: string;
  totalColaboradores: number;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading, moderar } = useDpAvisoEngajamento(avisoId);

  const leituras = data?.leituras ?? [];
  const reacoes = data?.reacoes ?? [];
  const comentarios = data?.comentarios ?? [];

  const porEmoji = reacoes.reduce<Record<string, number>>((acc, r: any) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Dialog open={!!avisoId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">Engajamento — {titulo}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Confirmações de leitura</p>
                <p className="text-xl font-semibold">
                  {leituras.length}
                  {totalColaboradores > 0 && (
                    <span className="text-sm font-normal text-muted-foreground"> / {totalColaboradores}</span>
                  )}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Reações</p>
                <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  {Object.keys(porEmoji).length === 0 ? (
                    <span className="text-sm font-normal text-muted-foreground">Nenhuma</span>
                  ) : (
                    Object.entries(porEmoji).map(([e, n]) => (
                      <span key={e}>
                        {e} <span className="text-sm text-muted-foreground">{n}</span>
                      </span>
                    ))
                  )}
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ThumbsUp className="h-4 w-4" /> Comentários ({comentarios.length})
              </h4>
              {comentarios.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum comentário.</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {comentarios.map((c) => (
                    <div key={c.id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{c.autor_nome ?? "Colaborador"}</span>
                        <div className="flex items-center gap-1">
                          <Badge
                            variant={c.status === "aprovado" ? "default" : c.status === "oculto" ? "destructive" : "outline"}
                            className="text-[10px] capitalize"
                          >
                            {c.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{c.conteudo}</p>
                      <div className="mt-2 flex gap-2">
                        {c.status !== "aprovado" && (
                          <Button size="sm" variant="outline" onClick={() => moderar.mutate({ id: c.id, status: "aprovado" })}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar
                          </Button>
                        )}
                        {c.status !== "oculto" && (
                          <Button size="sm" variant="ghost" onClick={() => moderar.mutate({ id: c.id, status: "oculto" })}>
                            <EyeOff className="mr-1 h-3.5 w-3.5" /> Ocultar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

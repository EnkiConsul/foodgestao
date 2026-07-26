import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, MessageSquare, Paperclip, Pin, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useDpMural, MURAL_EMOJIS, type MuralAviso } from "@/hooks/useDpMural";

function AvisoCard({
  aviso,
  mural,
}: {
  aviso: MuralAviso;
  mural: ReturnType<typeof useDpMural>;
}) {
  const [texto, setTexto] = useState("");
  const [mostrarComentarios, setMostrarComentarios] = useState(false);

  const lido = mural.lidos.has(aviso.id);
  const reacoesAviso = mural.reacoes.filter((r: any) => r.aviso_id === aviso.id);
  const minhaReacao = reacoesAviso.find((r: any) => r.user_id === mural.userId) as any;
  const comentariosAviso = mural.comentarios.filter((c) => c.aviso_id === aviso.id);

  const abrirAnexo = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <article className="rounded-lg border bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {aviso.fixado && <Pin className="h-3.5 w-3.5 text-primary" />}
            <h3 className="text-base font-semibold">{aviso.titulo}</h3>
            {aviso.leitura_obrigatoria && (
              <Badge variant="outline" className="text-[10px]">Leitura obrigatória</Badge>
            )}
            {aviso.prioridade === "urgente" && (
              <Badge variant="destructive" className="text-[10px]">Urgente</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(aviso.publicado_em), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        {lido && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Lido
          </span>
        )}
      </header>

      <p className="mt-2 whitespace-pre-wrap text-sm">{aviso.conteudo}</p>

      {aviso.arquivo_path && (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => abrirAnexo(aviso.arquivo_path!)}>
          <Paperclip className="mr-1 h-4 w-4" /> Ver anexo
        </Button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {aviso.permitir_reacoes &&
          MURAL_EMOJIS.map((emoji) => {
            const total = reacoesAviso.filter((r: any) => r.emoji === emoji).length;
            const ativo = minhaReacao?.emoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => mural.toggleReacao.mutate({ avisoId: aviso.id, emoji })}
                className={cn(
                  "rounded-full border px-2 py-1 text-sm transition-colors",
                  ativo ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                {emoji}
                {total > 0 && <span className="ml-1 text-xs text-muted-foreground">{total}</span>}
              </button>
            );
          })}

        {aviso.permitir_comentarios && (
          <Button size="sm" variant="ghost" onClick={() => setMostrarComentarios((v) => !v)}>
            <MessageSquare className="mr-1 h-4 w-4" />
            {comentariosAviso.length > 0 ? `${comentariosAviso.length} comentário(s)` : "Comentar"}
          </Button>
        )}

        {!lido && (
          <Button
            size="sm"
            variant={aviso.leitura_obrigatoria ? "default" : "outline"}
            className="ml-auto"
            onClick={() => mural.marcarLeitura.mutate(aviso.id)}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" /> Confirmar leitura
          </Button>
        )}
      </div>

      {aviso.permitir_comentarios && mostrarComentarios && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {comentariosAviso.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
          )}
          {comentariosAviso.map((c) => (
            <div key={c.id} className="rounded-md bg-muted/50 p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{c.autor_nome ?? "Colaborador"}</span>
                <div className="flex items-center gap-1">
                  {c.status === "pendente" && (
                    <Badge variant="outline" className="text-[10px]">Em moderação</Badge>
                  )}
                  {c.user_id === mural.userId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => mural.removerComentario.mutate(c.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{c.conteudo}</p>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              placeholder="Escreva um comentário…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <Button
              size="icon"
              disabled={!texto.trim() || mural.comentar.isPending}
              onClick={() => {
                mural.comentar.mutate(
                  { aviso, conteudo: texto.trim() },
                  { onSuccess: () => setTexto("") },
                );
              }}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

export function MuralFeed() {
  const mural = useDpMural();
  const avisos = mural.avisos.data ?? [];

  if (mural.avisos.isLoading) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Carregando mural…
      </div>
    );
  }

  if (avisos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Nenhum aviso publicado no momento.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {avisos.map((a) => (
        <AvisoCard key={a.id} aviso={a} mural={mural} />
      ))}
    </div>
  );
}

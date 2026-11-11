import { useEffect, useRef, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { maskPhone } from "@/lib/phone";
import {
  contatoValido,
  type ContatoEditado,
} from "@/lib/dp/ficha-registro/organizacao-lote";
import { cn } from "@/lib/utils";

export type LinhaContatoLote = {
  id: string;
  nome: string;
  detalhe: string | null;
  whatsapp: string;
  email: string;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Fichas sem dados de acesso (a lista fica fixa enquanto o diálogo está aberto). */
  linhas: LinhaContatoLote[];
  /** Ficha que já abre com o cursor no WhatsApp. */
  focoId: string | null;
  salvando: boolean;
  onSalvar: (edicoes: Record<string, ContatoEditado>) => Promise<void>;
}

const vazio = (c?: ContatoEditado) =>
  !c || (!c.whatsapp.replace(/\D/g, "") && !c.email.trim());

/**
 * Lista rápida de dados para acesso, como em "Gerar acesso": um WhatsApp por
 * linha, Enter pula para o próximo e um único botão salva todos no lote.
 * Não cria o cadastro — só completa o rascunho das fichas.
 */
export function ContatosLoteDialog({
  open,
  onOpenChange,
  linhas,
  focoId,
  salvando,
  onSalvar,
}: Props) {
  const [lista, setLista] = useState<LinhaContatoLote[]>([]);
  const [edits, setEdits] = useState<Record<string, ContatoEditado>>({});
  const [comEmail, setComEmail] = useState<Set<string>>(new Set());
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!open) return;
    setLista(linhas);
    setEdits(
      Object.fromEntries(
        linhas.map((l) => [
          l.id,
          { whatsapp: l.whatsapp ? maskPhone(l.whatsapp) : "", email: l.email },
        ]),
      ),
    );
    setComEmail(new Set(linhas.filter((l) => l.email).map((l) => l.id)));
    setTocados(new Set());
    const alvo = focoId ?? linhas[0]?.id;
    if (alvo) setTimeout(() => refs.current[alvo]?.focus(), 150);
    // Só reinicia ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mudar = (id: string, patch: Partial<ContatoEditado>) =>
    setEdits((e) => ({
      ...e,
      [id]: { ...(e[id] ?? { whatsapp: "", email: "" }), ...patch },
    }));
  const erroDe = (id: string) =>
    vazio(edits[id]) ? null : contatoValido(edits[id]);
  const preenchidos = lista.filter(
    (l) => !vazio(edits[l.id]) && !erroDe(l.id),
  ).length;
  const comErro = lista.filter((l) => !!erroDe(l.id)).length;

  const proximo = (id: string) => {
    const i = lista.findIndex((l) => l.id === id);
    const prox = lista[i + 1];
    if (prox) refs.current[prox.id]?.focus();
    else refs.current[id]?.blur();
  };

  const salvar = async () => {
    setTocados(new Set(lista.map((l) => l.id)));
    if (comErro > 0) return;
    try {
      await onSalvar(edits);
      onOpenChange(false);
    } catch {
      /* a mensagem já foi mostrada */
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-warning" /> Dados para acesso
        </span>
      }
      description="Preencha os que souber; os demais ficam para depois. O acesso ao portal sai quando o cadastro for criado."
      className="sm:max-w-xl"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <p className="min-w-0 text-xs text-muted-foreground tabular-nums sm:flex-1">
            {preenchidos} de {lista.length} preenchidos
            {comErro > 0 && (
              <span className="block text-destructive">
                {comErro} com número ou e-mail inválido
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 sm:flex-none"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              className="h-11 flex-1 sm:flex-none"
              disabled={salvando || preenchidos === 0}
              onClick={salvar}
            >
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar contatos
            </Button>
          </div>
        </div>
      }
    >
      <ul className="divide-y rounded-lg border sm:max-h-[55vh] sm:overflow-y-auto">
        {lista.map((l) => {
          const e = edits[l.id] ?? { whatsapp: "", email: "" };
          const erro = tocados.has(l.id) ? erroDe(l.id) : null;
          const ok = !vazio(e) && !erroDe(l.id);
          const mostrarEmail = comEmail.has(l.id);
          return (
            <li
              key={l.id}
              className={cn("space-y-1.5 px-3 py-2.5", ok && "bg-primary/5")}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {l.nome}
                  </span>
                  {l.detalhe && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {l.detalhe}
                    </span>
                  )}
                </span>
                {ok && (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-primary"
                    aria-label="Preenchido"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  ref={(el) => {
                    refs.current[l.id] = el;
                  }}
                  className="h-11 flex-1 tabular-nums"
                  type="tel"
                  inputMode="tel"
                  enterKeyHint="next"
                  autoComplete="off"
                  placeholder="WhatsApp com DDD"
                  aria-label={`WhatsApp de ${l.nome}`}
                  aria-invalid={!!erro}
                  value={e.whatsapp}
                  onChange={(ev) =>
                    mudar(l.id, { whatsapp: maskPhone(ev.target.value) })
                  }
                  onBlur={() => setTocados((t) => new Set(t).add(l.id))}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      proximo(l.id);
                    }
                  }}
                />
                {!mostrarEmail && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    aria-label={`Usar e-mail para ${l.nome}`}
                    onClick={() => setComEmail((s) => new Set(s).add(l.id))}
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {mostrarEmail && (
                <Input
                  className="h-11"
                  type="email"
                  inputMode="email"
                  enterKeyHint="next"
                  autoComplete="off"
                  placeholder="E-mail (opcional)"
                  aria-label={`E-mail de ${l.nome}`}
                  value={e.email}
                  onChange={(ev) => mudar(l.id, { email: ev.target.value })}
                  onBlur={() => setTocados((t) => new Set(t).add(l.id))}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      proximo(l.id);
                    }
                  }}
                />
              )}
              {erro && <p className="text-xs text-destructive">{erro}</p>}
            </li>
          );
        })}
        {lista.length === 0 && (
          <li className="p-4 text-center text-sm text-muted-foreground">
            Todas as fichas já têm dados para acesso.
          </li>
        )}
      </ul>
    </ResponsiveDialog>
  );
}

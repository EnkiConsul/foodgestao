import { CheckCircle2, XCircle } from "lucide-react";

/** Mostra em tempo real se a confirmação confere com a senha. */
export function ConferenciaSenhas({ senha, confirmacao }: { senha: string; confirmacao: string }) {
  if (!confirmacao) return null;
  const ok = senha === confirmacao;
  return (
    <p
      aria-live="polite"
      className={`flex items-center gap-1.5 text-xs ${ok ? "text-primary" : "text-destructive"}`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {ok ? "As senhas conferem" : "As senhas não coincidem"}
    </p>
  );
}

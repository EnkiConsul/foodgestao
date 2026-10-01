import { Check, Circle, Lightbulb, X } from "lucide-react";
import {
  avaliarSenha,
  SENHA_MIN,
  type SenhaProblema,
} from "@/lib/security/passwordPolicy";

interface Props {
  senha: string;
  dados?: { nome?: string | null; email?: string | null; cpf?: string | null };
  /** Mostra o box com a dica prática de senha fácil de lembrar. */
  mostrarDica?: boolean;
  id?: string;
}

/** Requisitos obrigatórios, na ordem em que o colaborador costuma preencher. */
const REQUISITOS: Array<{ chave: SenhaProblema; rotulo: string }> = [
  { chave: "curta", rotulo: `Pelo menos ${SENHA_MIN} caracteres` },
  { chave: "sem_maiuscula", rotulo: "1 letra maiúscula (A-Z)" },
  { chave: "sem_minuscula", rotulo: "1 letra minúscula (a-z)" },
  { chave: "sem_numero", rotulo: "1 número (0 a 9)" },
  { chave: "sem_simbolo", rotulo: "1 símbolo (@ # $ * ! ?)" },
];

/** Problemas que não são "requisito", e sim avisos pontuais. */
const AVISOS: Array<{ chave: SenhaProblema; rotulo: string }> = [
  { chave: "comum", rotulo: "Essa senha é muito comum. Escolha outra combinação." },
  { chave: "sequencial", rotulo: "Evite sequências como 123456 ou abcdef." },
  { chave: "repetida", rotulo: "Evite repetir a mesma letra ou número várias vezes." },
  { chave: "dado_pessoal", rotulo: "Não use seu nome, e-mail ou CPF na senha." },
  { chave: "longa", rotulo: "Essa senha é longa demais. Use uma combinação mais curta." },
];

/**
 * Lista de requisitos que acende em verde conforme o colaborador digita.
 * Toda a avaliação é local: a senha não sai do navegador.
 */
export function ChecklistRequisitosSenha({ senha, dados, mostrarDica = true, id }: Props) {
  const { problemas } = avaliarSenha(senha, dados);
  const faltando = new Set(problemas);
  const digitou = senha.length > 0;
  const avisosAtivos = AVISOS.filter((a) => faltando.has(a.chave));

  return (
    <div id={id} className="space-y-2" aria-live="polite">
      <ul className="space-y-1.5">
        {REQUISITOS.map(({ chave, rotulo }) => {
          const atendido = digitou && !faltando.has(chave);
          return (
            <li
              key={chave}
              className={`flex items-center gap-2 text-xs ${
                atendido ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  atendido ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                }`}
                aria-hidden="true"
              >
                {atendido ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2 opacity-0" />}
              </span>
              <span>
                {rotulo}
                {chave === "curta" && digitou && senha.length < SENHA_MIN
                  ? ` (${senha.length} de ${SENHA_MIN})`
                  : ""}
              </span>
              <span className="sr-only">{atendido ? "— pronto" : "— ainda falta"}</span>
            </li>
          );
        })}
      </ul>

      {avisosAtivos.length > 0 && (
        <ul className="space-y-1">
          {avisosAtivos.map(({ chave, rotulo }) => (
            <li key={chave} className="flex items-start gap-2 text-xs text-destructive">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{rotulo}</span>
            </li>
          ))}
        </ul>
      )}

      {mostrarDica && (
        <div className="flex items-start gap-2 rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong className="font-medium text-foreground">Dica fácil para não esquecer:</strong>{" "}
            junte duas palavras comuns com um ano e um símbolo. Exemplo:{" "}
            <span className="font-mono">MinhaPizza@2026</span>
          </span>
        </div>
      )}
    </div>
  );
}

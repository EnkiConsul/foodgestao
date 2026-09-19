import { avaliarSenha, SENHA_MIN } from "@/lib/security/passwordPolicy";

interface Props {
  senha: string;
  dados?: { nome?: string | null; email?: string | null; cpf?: string | null };
  /** id para ligar o medidor ao campo por aria-describedby */
  id?: string;
}

const CORES = [
  "bg-destructive",
  "bg-destructive",
  "bg-warning",
  "bg-primary",
  "bg-primary",
];

/**
 * Medidor de força local, em português. A senha não sai do navegador:
 * a avaliação é feita em memória, sem nenhuma chamada de rede.
 */
export function MedidorSenha({ senha, dados, id }: Props) {
  if (!senha) return null;
  const { pontuacao, rotulo, mensagem } = avaliarSenha(senha, dados);
  const preenchidas = pontuacao + 1;

  return (
    <div id={id} className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < preenchidas ? CORES[pontuacao] : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Força da senha: {rotulo}
        {mensagem ? ` — ${mensagem}` : ` — atende à regra de ${SENHA_MIN} caracteres`}
      </p>
    </div>
  );
}

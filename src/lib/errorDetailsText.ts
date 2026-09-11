/**
 * Formatação dos detalhes técnicos de um erro para leitura humana e para o
 * botão "Copiar detalhes" da Auditoria de erros. Fica separado da tela para
 * poder ser testado sem renderizar componentes.
 */

export const USUARIO_NAO_IDENTIFICADO = "Sem usuário identificado (sessão não autenticada)";

export function usuarioLabel(args: { nome?: string | null; email?: string | null }): string {
  const nome = args.nome?.trim();
  const email = args.email?.trim();
  if (nome && email) return `${nome} (${email})`;
  if (nome) return nome;
  if (email) return email;
  return USUARIO_NAO_IDENTIFICADO;
}

export type ErroDetalhesInput = {
  message: string;
  surface?: string | null;
  action?: string | null;
  route?: string | null;
  source?: string | null;
  severity?: string | null;
  code?: string | null;
  userMessage?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  companyId?: string | null;
  occurrences?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  details?: Record<string, unknown> | null;
};

/** Separa a pilha/stack e o restante do contexto técnico gravado. */
export function separarDetalhes(details: Record<string, unknown> | null | undefined) {
  const d = details ?? {};
  const stack = typeof d.stack === "string" ? d.stack : null;
  const componentStack = typeof d.componentStack === "string" ? d.componentStack : null;
  const agent = typeof d.agent === "string" ? d.agent : null;
  const extra: Record<string, unknown> = {};
  Object.entries(d).forEach(([k, v]) => {
    if (k === "stack" || k === "componentStack" || k === "agent") return;
    extra[k] = v;
  });
  return { stack, componentStack, agent, extra };
}

/** Texto único com tudo que o suporte precisa para investigar. */
export function errorDetailsToText(input: ErroDetalhesInput): string {
  const { stack, componentStack, agent, extra } = separarDetalhes(input.details);
  const linhas: string[] = [];
  const add = (rotulo: string, valor?: string | null) => {
    if (valor && String(valor).trim()) linhas.push(`${rotulo}: ${valor}`);
  };
  add("Mensagem", input.message);
  add("Tela", input.surface);
  add("Ação", input.action);
  add("Endereço", input.route);
  add("Origem", input.source);
  add("Gravidade", input.severity);
  add("Código", input.code);
  add("Mensagem mostrada", input.userMessage);
  add("Usuário", usuarioLabel({ nome: input.userName, email: input.userEmail }));
  add("Empresa", input.companyId);
  add("Repetições", input.occurrences ? String(input.occurrences) : null);
  add("Primeira vez", input.firstSeenAt);
  add("Última vez", input.lastSeenAt);
  add("Navegador", agent);
  if (Object.keys(extra).length > 0) {
    linhas.push(`Contexto: ${JSON.stringify(extra)}`);
  }
  if (componentStack) linhas.push(`\nComponentes:\n${componentStack}`);
  if (stack) linhas.push(`\nPilha técnica:\n${stack}`);
  return linhas.join("\n");
}

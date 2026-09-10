# Ajustes finos na tela de login (mobile)

## Objetivo
Eliminar a rolagem do formulário de login no mobile, remover texto redundante e compactar o espaçamento entre o widget Cloudflare e o botão "Entrar", sem alterar autenticação, segurança ou comportamentos existentes.

## O que será feito

1. **Remover texto de CPF**
   - Excluir o parágrafo "Colaboradores podem entrar com CPF neste mesmo formulário." do rodapé do card de login.

2. **Ajustar altura do card no mobile**
   - Aumentar `max-h-[53svh]` para aproveitar melhor a tela, garantindo que o formulário de login padrão caiba sem scroll vertical.
   - Manter `overflow-y-auto` apenas como segurança para estados inesperados (mensagens de erro longas, MFA etc.), mas o objetivo é não precisar de rolagem no fluxo normal.

3. **Compactar espaçamentos internos**
   - Reduzir o gap entre o widget Turnstile/Cloudflare e o botão "Entrar" no mobile (`space-y-*` do CardContent e `gap-*`/`pt-*` da seção do Turnstile).
   - Ajustar levemente paddings do `CardHeader`, `CardContent` e `CardFooter` no mobile para ganhar espaço vertical sem apertar demais.
   - Preservar os espaçamentos atuais em desktop/tablet para não regredir o layout maior.

## Escopo e restrições
- Alterações apenas em `src/pages/Auth.tsx`.
- Nenhuma mudança em lógica de autenticação, validação, redirecionamento, convites, MFA, Turnstile ou cadastro.
- Manter a arte de fundo atual e o formulário translúcido centralizado.
- Validar visualmente no preview mobile e executar os testes de autenticação existentes.

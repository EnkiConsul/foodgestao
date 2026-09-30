# Correção do calendário e da rotina da Hanna (ambiente de teste)

## O que será corrigido
1. **Folgas de outubro voltam a aparecer** (da Hanna e dos colegas) no calendário do portal.
2. **Janela do dia não corta mais o texto**: status e botões longos quebram em duas linhas.
3. **Rotina da loja rola até o fim**, acima da barra inferior do celular.

## Detalhes técnicos
- Migration: recriar `dp_portal_equipe_unidade()` convertendo `folga_fixa_semana` para `integer` (`::integer`) no retorno, mantendo SECURITY DEFINER, mesmos filtros (só própria unidade, só nome/nome social/função/folgas). Conceder `GRANT EXECUTE ... TO authenticated` nela (chamada via `supabase.rpc`); `dp_dias_fixos_folga` permanece só interna. Reversível (recriar versão anterior).
- Modal do dia em `DpMeuCalendario.tsx`: botões longos com `whitespace-normal h-auto text-left break-words`; badge de status sem `truncate`, cabeçalho com `flex-wrap min-w-0`.
- `CalendarioMobileLista.tsx`: chips com `break-words` no lugar de `truncate`.
- `DpShell.tsx`: `main` com `pb-28 md:pb-8` no mobile para liberar espaço da barra inferior.
- Validar com Playwright como Hanna (360px): chips em 18, 24, 25 e 31/10, modal sem corte, rotina rolando até o fim. Não publicar.

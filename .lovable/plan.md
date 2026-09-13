# Convocação: erro ao publicar e falta do botão de relatar

## O que aconteceu

Encontrei a causa exata. Existe uma regra no banco que impede lançar trabalho para quem está de férias. Essa regra é usada por dois cadastros diferentes: a escala do mês e as convocações. Ela consulta um campo de "tipo" que só existe na escala — nas convocações esse campo não existe, e por isso qualquer publicação de convocação para quem seria convocado quebra com a mensagem técnica que apareceu na sua tela.

Ou seja: não é problema do seu rascunho da Pakerê nem do horário. Nenhuma convocação consegue ser publicada hoje.

Segundo ponto: essa falha veio da resposta do servidor, e nesse caminho a tela só mostrava o texto técnico do erro. Ela não registrava o problema na auditoria e, por isso, o aviso "Relatar problema" nunca aparecia.

## O que vou fazer

1. **Corrigir a regra de férias no banco** para que ela verifique o "tipo" apenas quando o lançamento for da escala, e faça a checagem de férias normalmente nas convocações. Continua valendo o bloqueio de convocar quem está de férias.
2. **Nunca mais mostrar texto técnico ao publicar**: quando o servidor devolver uma falha que o sistema não reconhece, a tela mostra "Não foi possível publicar a convocação. Tente novamente — se continuar, relate o problema."
3. **Ligar o registro de erro nesse caminho**: toda falha não reconhecida ao salvar ou publicar convocação passa a ser registrada, o que faz o aviso com o botão "Relatar problema" aparecer, como já acontece nas outras telas.
4. **Publicar de verdade o rascunho de teste** para confirmar que a correção funciona ponta a ponta.

## Detalhes técnicos

- `public.dp_bloquear_durante_ferias()` avalia `NEW.tipo` na mesma expressão de `TG_TABLE_NAME`; PL/pgSQL resolve o campo do registro na execução, então em `dp_convocacoes` (sem coluna `tipo`) o erro `record "new" has no field "tipo"` ocorre mesmo com a comparação de tabela falsa. Migração reescreve a função com `IF` aninhado por tabela (`dp_escala_itens` → checa `tipo`; `dp_folgas` → `status`; `dp_convocacoes` → `status`), mantendo `SECURITY DEFINER`/`search_path` atuais.
- `NovaConvocacaoPlanner.tsx`: `tratarErroDeGravacao` e o `catch` de `publicarGrupo` deixam de exibir `e.message` cru; usam mensagem amigável e chamam `reportError` de `@/lib/errorLog` com `surface: "Convocações"`, `action: "publicar convocação"` e `details` (grupo, unidade, dias), disparando o fluxo do `ErrorReportCenter`.
- Verificação: publicar o rascunho da Pakerê e conferir que não há novo registro dessa assinatura em `app_error_logs`.

# Excluir rascunho de convocação: corrigir o erro

## O que está acontecendo

Encontrei a causa. Ao excluir, o sistema tenta marcar a convocação com a palavra "cancelada", mas o cadastro de convocações só aceita "cancelado" (com O). A gravação é recusada, nada é excluído e a tela cai na mensagem genérica de falar com o suporte.

Confirmado no banco: a regra de valores permitidos da convocação aceita rascunho, publicado, encerrado e cancelado; a rotina de exclusão grava "cancelada". Os dois rascunhos da Pakerê seguem intactos, então nada foi perdido.

## O que vai ser feito

1. Corrigir a rotina de exclusão para usar exatamente a palavra que o cadastro aceita, de forma que o rascunho seja arquivado e os dias planejados sejam liberados.
2. Ajustar a lista de convocações para esconder tanto "cancelado" quanto "cancelada", para que o rascunho excluído desapareça da tela em qualquer um dos casos.
3. Registrar essa falha na tela de erros com o rascunho envolvido, para que uma recusa assim apareça no diagnóstico em vez de virar só uma mensagem genérica.
4. Mensagem de erro mais útil quando a exclusão for recusada por falta de permissão ("só administradores e donos podem excluir") em vez do texto sobre suporte.

Depois disso você poderá excluir o rascunho antigo de 06–07/09 que está travando os dias 18 e 19.

## Detalhes técnicos

- `public.dp_convocacao_excluir_grupo`: o `update public.dp_convocacao_grupos set status = 'cancelada'` viola `dp_convocacao_grupos_status_check` (`ARRAY['rascunho','publicado','encerrado','cancelado']`), erro `23514`, e faz a transação inteira voltar atrás — inclusive o cancelamento das ocorrências. Nova migração recria a função usando `'cancelado'` no grupo e mantém `'cancelada'` nas ocorrências (valor válido em `dp_conv_ocor_status_check`).
- `useDpConvocacaoGrupos.tsx` linha 34: trocar `g.status !== "cancelada"` por exclusão dos dois valores.
- `useExcluirRascunhoConvocacao` (`onError`): tratar `FORBIDDEN` com texto próprio e chamar o registro de erro do app (`logger`) com `grupo_id`, além dos casos `NOT_DRAFT` e `STALE_VERSION` já existentes.
- Validação: Playwright em viewport 390x844, excluindo o rascunho `293ca4ba-03e1-4ca9-b43c-1b772d004d7c` e confirmando que ele sai da lista e que os dias 18/19 deixam de conflitar.

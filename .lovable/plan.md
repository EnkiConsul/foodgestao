# Exclusão de planos com assinaturas vinculadas

## O que está acontecendo

A tela de Planos tenta excluir o plano direto no banco. Como existem assinaturas apontando para o plano, o banco recusa a exclusão (chave estrangeira `subscriptions.plan_id`) e a mensagem técnica aparece no toast.

Situação real hoje (confirmada no banco):

| Plano | Ativo | Assinaturas |
| --- | --- | --- |
| Free | não | 30 |
| Business | não | 7 |
| Starter | não | 2 |
| Pro | não | 2 |
| 360° Food Essencial | sim | 1 |
| 360° Food Gestão | sim | 0 |
| 360° Food Multiempresa | sim | 0 |

Planos legados carregam histórico de assinaturas, então excluí-los apagaria/quebraria esse histórico — o correto é desativar, não excluir.

## Correções propostas

1. **Mostrar a contagem de assinaturas em cada card de plano** ("30 assinaturas"), para ficar claro antes de tentar excluir.
2. **Bloquear a exclusão quando houver assinaturas**: o botão de excluir fica desabilitado com tooltip explicando ("Plano com 30 assinaturas — desative em vez de excluir"). Planos sem assinaturas continuam podendo ser excluídos.
3. **Diálogo de confirmação mais claro**: quando o plano tem assinaturas, oferecer a ação "Desativar plano" (marca `is_active`/`is_public` como falso) em lugar de excluir.
4. **Mensagem de erro amigável**: se o banco ainda recusar por vínculo, mostrar "Este plano possui assinaturas vinculadas. Desative-o em vez de excluir." em vez do texto técnico da constraint.

## Detalhes técnicos

- `src/hooks/usePlans.tsx`: nova query com contagem de assinaturas por plano (agregação em `subscriptions` agrupada por `plan_id`); em `useDeletePlan`, traduzir o código de erro `23503` para a mensagem amigável.
- `src/components/admin/AdminPlans.tsx`: exibir a contagem, desabilitar o botão de excluir com tooltip e trocar o diálogo por "Desativar plano" quando houver vínculos (usando o `useUpsertPlan` existente).
- Sem alterações de schema, RLS ou dados.

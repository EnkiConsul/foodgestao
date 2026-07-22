## Problema

08/08/2026 aparece disponível no calendário do colaborador mesmo com a regra ativa "Bloqueio Pós-Pagamento (FDS após dia 5)". O banco tem 7 regras ativas para a empresa `b0d450a7…`, mas a requisição `GET /dp_bloqueio_regras?ativo=eq.true` da tela `/dp/meu/calendario` retornou `[]`. O mesmo aconteceu com `dp_bloqueio_regra_unidades`.

## Causa raiz

RLS de `dp_bloqueio_regras` e `dp_bloqueio_regra_unidades` autoriza leitura apenas para membros em `company_members`. O colaborador logado (`is_dp_colaborador = true`, `company_members = []`) é vinculado apenas por `dp_colaboradores.user_id`, então cai fora das policies e recebe conjunto vazio — o motor runtime (`buildBloqueiosDeRegras`) não tem regras para expandir e o dia fica marcado como disponível. É a mesma lacuna que já corrigi em `dp_folgas`.

## Correção

Migração SQL adicionando políticas SELECT para colaboradores autenticados, restritas à empresa deles via `public.dp_colaborador_of(auth.uid())`:

- `dp_bloqueio_regras`: nova policy `dp_bloqueio_regras_read_colaborador` — permite `SELECT` quando `company_id` = empresa do colaborador (join em `dp_colaboradores.id = dp_colaborador_of(auth.uid())`).
- `dp_bloqueio_regra_unidades`: nova policy `dp_bloqueio_regra_unidades_read_colaborador` — permite `SELECT` quando o `regra_id` pertence a uma regra da empresa do colaborador.

Ambas apenas leitura, sem `INSERT/UPDATE/DELETE` (mantém edição restrita a admin/owner). Nenhuma alteração de frontend é necessária — o `regrasBloqueioQuery` já consome esses endpoints e será refetchado automaticamente.

## Validação

Após a migração, no portal do colaborador, 08/08/2026 e 09/08/2026 (fim de semana após dia 5 de agosto) devem aparecer bloqueados com o motivo "Bloqueio Pós-Pagamento (FDS após dia 5)". Também confirmar que 09/08/2026 mostra "Dia dos Pais" (2º domingo) e 12/06, 12/10, 24/12, 31/12 seguem bloqueados nos meses correspondentes.

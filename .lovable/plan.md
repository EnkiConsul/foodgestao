# Trocas: ações do gestor separadas das do colega

Hoje a tela de Trocas do administrador mostra "Colega aceita" e "Colega recusa", ou seja, o gestor responde no lugar do colaborador. Isso sai.

## O que muda na tela do gestor (Pessoas > Folgas > Trocas)

Por situação da troca:

- **Aguardando colega**: nenhum botão de aceitar/recusar em nome do colega. Só um botão **Recusar troca**, que pede uma justificativa obrigatória e encerra a solicitação.
- **Aguardando gestor**: continua com **Aprovar** e **Recusar** (recusa com justificativa obrigatória).
- **Aprovada**: novo botão **Cancelar troca**, com justificativa obrigatória. Ao cancelar, a troca volta atrás: a folga criada para quem pediu é cancelada e a folga de quem cedeu o dia é restaurada.
- **Recusada / Cancelada**: sem ações, apenas o histórico.

A justificativa do gestor aparece no card, identificada como decisão do gestor, com a data.

## O que os dois colaboradores passam a ver

- Na tela de trocas do colaborador (portal), quem pediu **e** quem foi convidado veem o resultado com a justificativa do gestor quando houver recusa ou cancelamento.
- Os dois recebem aviso quando o gestor recusa ou cancela (hoje só quem pediu recebe).

## Detalhes técnicos

- Nova RPC `dp_cancelar_troca(_troca_id uuid, _motivo text)`: `SECURITY DEFINER`, `search_path = public`, exige `is_company_admin_or_owner` ou `is_super_admin`, aceita apenas status `aprovada`, com `FOR UPDATE` na linha. Reverte o efeito de `dp_processar_troca`: cancela a folga de origem `troca` do solicitante na `data_original` (registrando em `dp_folgas_canceladas` com origem `troca`), reativa a folga do destino cancelada por aquela troca quando existir, grava `gestor_resposta`, `gestor_respondido_em`, `gestor_id` e `status = 'cancelada'`. `GRANT EXECUTE` para `authenticated` e `service_role`.
- `dp_notif_troca`: ao mudar `gestor_resposta`, notificar solicitante **e** destino (busca `user_id` dos dois em `dp_colaboradores`), com título distinto para recusa e cancelamento.
- `useDpTrocas.tsx`: remover a etapa `colega` do `responder` (fica só gestor: aprovar/recusar) e adicionar mutation `cancelar({ id, motivo })` chamando a nova RPC; invalidar `dp_trocas`, `dp_folgas` e `dp_pendencias`.
- `DpTrocas.tsx`: botões por status conforme acima, `RecusaDialog` com `motivoObrigatorio` para recusa e cancelamento, exibição da justificativa do gestor no card. Tipar as linhas em vez de `any` no trecho alterado.
- `DpMeuTrocas.tsx`: exibir a justificativa do gestor para solicitante e destino.
- Testes: unitário do mapeamento status → ações permitidas; teste de banco cobrindo cancelamento (folga revertida) e recusa de autorização para não-admin. Rodar typecheck, lint e vitest.

## Fora do escopo

- Reabrir ou refazer uma troca cancelada.
- Mudanças no fluxo de aceite do colaborador no portal.

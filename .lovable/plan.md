# Habilitar sincronização Pluggy em tempo real

## Diagnóstico confirmado

- Handler `supabase/functions/pluggy-webhook/index.ts` **já dispara sync** para eventos `item/updated`, `transactions/created` e `transactions/updated` (regex `/transactions|item\/updated|updated/i` na linha 59) e chama `pluggy-sync-connection` com o `connectionId` correspondente.
- Nos últimos 15 webhooks recebidos (tabela `pluggy_webhook_events`), **100% são `connector/status_updated`** — nenhum evento de transação/item chegou. Último webhook em 11/07; hoje é 21/07.
- Conclusão: o código do lado 360°FOOD está correto. O que falta é **inscrever os eventos certos no painel da Pluggy** — a Pluggy exige um webhook cadastrado por tipo de evento (ou um único com `event: 'all'`).

## Ação necessária (painel Pluggy — feita pelo usuário)

No dashboard Pluggy → **Webhooks**, cadastrar (ou editar) o endpoint apontando para:

```
https://<projeto>.supabase.co/functions/v1/pluggy-webhook?token=<PLUGGY_WEBHOOK_TOKEN>
```

Adicionar assinaturas para os seguintes eventos (uma entrada por tipo, ou uma única com `all`):

- `item/updated` — dispara quando a Pluggy termina uma atualização do item.
- `transactions/created` — novas transações identificadas.
- `transactions/updated` — transações alteradas (ex.: descrição enriquecida).
- Manter também `connector/status_updated` (já funciona) para refletir credenciais expiradas.

Alternativa recomendada: cadastrar **um único webhook com `event: "all"`** e deixar o handler filtrar (ele já faz isso). Mais simples de manter.

## Ajuste opcional no código (após habilitar os eventos)

Se após inscrever os eventos você ainda quiser mais robustez, faço estas melhorias no handler:

1. **Idempotência por evento**: guardar `event_id` da Pluggy no `pluggy_webhook_events` e ignorar repetidos.
2. **Log estruturado** por tipo de evento para facilitar auditoria no painel de logs.
3. **Fallback para itens sem `itemId` no payload**, extraindo de `data.itemId` (algumas versões do payload).
4. **Sync incremental**: passar um `since` (última data conhecida) para `pluggy-sync-connection` a fim de reduzir custo por chamada.

Esses ajustes são opcionais — o fluxo em tempo real passa a funcionar assim que os eventos forem inscritos no painel.

## Verificação

1. Após inscrever os eventos no painel, forçar uma atualização do item (ex.: aguardar próxima atualização automática ou tocar em "Sincronizar" no 360°FOOD).
2. Rodar `select event_type, received_at from pluggy_webhook_events order by received_at desc limit 10` e confirmar a chegada de `item/updated` / `transactions/*`.
3. Conferir que `bank_connections.last_sync_at` é atualizado logo após o webhook (sem esperar o cron das 03h BRT).
4. Confirmar novos lançamentos importados aparecerem em `/lancamentos` sem intervenção manual.

## Escopo

- **Sem alterações de código nesta fase** (o handler já cobre os eventos).
- Ação principal é no painel Pluggy do usuário.
- Melhorias opcionais no handler ficam para uma segunda fase, apenas se o usuário confirmar.

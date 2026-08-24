# Conexões Open Finance duplicadas (cliente rcbruto77@gmail.com)

## Causa confirmada (consulta ao banco)

Na empresa do cliente existem 4 conexões, sendo 2 pares do mesmo banco:

```text
C6 Bank Empresas  item 69badae7...  criada 01/08  -> conta CREDIT "Bandeirado" final 2555
C6 Bank Empresas  item 0b9d48ec...  criada 04/08  -> conta CREDIT "Bandeirado" final 2555
Neon              item 3b6295fc...  criada 02/08  -> conta CREDIT "Sem nome"   final 4103
Neon              item 756166de...  criada 21/08  -> conta CREDIT "Sem nome"   final 4103
```

Ou seja: **não são contas diferentes — é o mesmo banco/cartão conectado duas vezes.**

Por que acontece: quando o cliente clica em "Conectar banco", o widget cria sempre um
**novo item na Pluggy** (novo `pluggy_item_id`). A tabela `pluggy_connections` só tem
unicidade por `pluggy_item_id`, não por (empresa + banco). Então cada nova autorização do
mesmo banco vira uma linha nova, e a antiga continua com status `updated` e aparecendo na
lista. O botão de reconectar (que reaproveita o `item_id`) existe, mas se o cliente usa
"Conectar banco" em vez dele, duplica.

Observação adicional: nesta empresa as 4 contas espelhadas são do tipo `CREDIT` (cartão) e
hoje nenhuma está vinculada; as contas bancárias locais foram todas excluídas. Logo, os
"pendentes" e o aviso de cartão detectado vêm dessas conexões repetidas.

## Correção proposta

1. **Deduplicação na entrada (sync)**
   Ao gravar/atualizar uma conexão, se já existir outra conexão ativa da mesma empresa com
   o mesmo `connector_id`, tratar a nova como substituta: marcar a antiga como `deleted`
   (e transferir/reaproveitar os vínculos de conta e cartão da antiga para a nova, quando
   o `number_masked`/tipo coincidir), em vez de manter as duas.

2. **Agrupar na tela**
   Em Conexões Open Finance, mostrar uma linha por banco, com aviso de conexão substituída
   quando houver histórico, e esconder conexões `deleted`.

3. **Reduzir o erro de uso**
   Ao iniciar "Conectar banco" e o cliente escolher um banco já conectado, oferecer
   "Atualizar a conexão existente" (reconectar pelo `item_id`) em vez de criar outra.

4. **Limpeza dos dados deste cliente**
   Desconectar/remover as conexões antigas duplicadas (C6 item `69badae7` e Neon item
   `3b6295fc`), mantendo as mais recentes, e limpar as pendências de cartão órfãs.

## Detalhes técnicos

- `supabase/functions/pluggy-sync-item/index.ts` (upsert em `onConflict: pluggy_item_id`,
  ~linha 271-290): após o upsert, marcar conexões irmãs da mesma empresa/`connector_id`
  como `deleted` e migrar `linked_account_id`/`linked_credit_card_id` das contas espelhadas
  equivalentes.
- Migração: índice único parcial em `pluggy_connections (company_id, connector_id)` para
  status diferente de `deleted`, evitando reincidência.
- `src/pages/ConexoesPluggy.tsx`: filtrar `status <> 'deleted'`, agrupar por
  `connector_id` e ajustar o fluxo do botão "Conectar banco".
- Limpeza pontual dos registros do cliente via SQL de dados (não migração).

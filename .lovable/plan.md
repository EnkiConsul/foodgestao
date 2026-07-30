## Resposta direta: de onde vem a descrição

O sistema usa, nesta ordem (`supabase/functions/_shared/tx-description.ts`):

1. `description` do Pluggy (campo do banco);
2. se vazio, `descriptionRaw`;
3. só se o texto for genérico ("PIX", "TED", "TRANSF ENVIADA"...) ele monta a descrição com `paymentData` / `merchant`.

## Por que apareceu duas vezes

Conferi as duas linhas na base. É o **mesmo pagamento** (boleto Unimed, R$ 1.352,00, conta e data iguais) e o **mesmo `providerId` do banco** (`2007309726841016836779...`), mas o Pluggy devolveu **dois `id` diferentes**:

| Pluggy id | Coletado em | `description` do banco |
|---|---|---|
| `bd181b9e…` | 28/07 05:29 | BANCO SICOOB S.A. |
| `b85dc8da…` | 30/07 00:48 | UNIMED GOIANIA COOPERATIVA DE TRABALHO MEDICO |

O banco reprocessou o registro e trocou a descrição; o Pluggy criou um novo `id`. Nosso anti-duplicidade usa **apenas** `pluggy_transaction_id`, então a segunda versão entrou como novo item pendente — e ambos foram confirmados, gerando 2 lançamentos (`0b8ab4f8…` e `7f8fe828…`). Em ambos os registros o `merchant.businessName` já era "UNIMED GOIANIA…", ou seja, a informação boa existia desde a primeira coleta.

## O que fazer

1. **Dedupe pelo ID do banco**: gravar `provider_id` (do `raw.providerId`) na staging e, na ingestão (`pluggy-sync-item` e o worker de webhook), tratar como o mesmo lançamento quando `company_id + pluggy_account_id + provider_id` coincidirem:
   - se a versão anterior está **pendente** → atualiza descrição/valor/data no mesmo item (nada duplicado na tela);
   - se já está **conciliada** → marca a nova versão como `duplicate` (não aparece na conciliação);
   - sem `providerId`, cai num fallback por `data + valor + conta`.
2. **Descrição melhor**: quando o `description` do banco for só o nome de instituição financeira (ex.: "BANCO SICOOB S.A.", "BANCO BRADESCO") e houver `merchant.businessName` / nome do recebedor, usar o nome do estabelecimento real. Isso evita o rótulo inútil já na primeira coleta.
3. **Limpeza do caso atual**: marcar a staging `b85dc8da…` como duplicada e remover o lançamento repetido `7f8fe828…` (via caminho que ajusta o saldo pelo motor financeiro), mantendo um único lançamento com a descrição "UNIMED GOIANIA…".

## Detalhes técnicos

- Migração: coluna `provider_id text` em `pluggy_staging_transactions` + índice único parcial `(company_id, pluggy_account_id, provider_id)` onde `provider_id is not null`; backfill a partir de `raw->>'providerId'`.
- `supabase/functions/_shared/tx-description.ts`: nova heurística "descrição é nome de banco" + preferência por `merchant.businessName`.
- `supabase/functions/pluggy-sync-item/index.ts` (e worker de webhook, se aplicável): substituir o upsert só por `pluggy_transaction_id` pela resolução por `provider_id` descrita acima.
- Sem mudanças na UI da Conciliação; o efeito é lista sem repetição.

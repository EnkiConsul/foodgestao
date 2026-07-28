## Diagnóstico

O motivo é o próprio banco: para transferências PIX enviadas, o C6/Sicoob devolve à Pluggy apenas o rótulo genérico `TRANSF ENVIADA PIX` no campo `description` (`descriptionRaw` também vem igual). Confirmei em 3 registros no staging.

O detalhe da contraparte está em `raw.paymentData.receiver`, com:
- `receiver.name` — ex.: `EMPRESA CINEMAS SAO LUIZ S.A.`, `MILANO COMERCIO VAREJISTA DE ALIMENTOS`, `FARMACIA E DROGARIA NISSEI S.A`
- `receiver.documentNumber.value` — CNPJ/CPF do destinatário
- `paymentMethod: "PIX"`

Ou seja, os dados existem — só não estão sendo aproveitados na coluna `description` que a tela de conciliação mostra.

## Correção proposta

Enriquecer a descrição no momento da ingestão (Edge Function `pluggy-sync-item`) e também na exibição em `/contas-bancarias/conciliacao`, sem tocar em nenhuma outra parte do sistema.

### 1. Backend — `supabase/functions/pluggy-sync-item/index.ts`

Ao montar as linhas para `pluggy_staging_transactions`, calcular um `description` composto quando o texto original for genérico (`TRANSF ENVIADA/RECEBIDA PIX`, `PIX ENVIADO`, `PIX RECEBIDO`, `TED`, `DOC`, etc.):

```text
"PIX enviado — EMPRESA CINEMAS SAO LUIZ S.A."
"PIX recebido — NAGASUBIAS CORPORATE LTDA"
```

Regra:
- Se `paymentData.receiver.name` existir e a transação for saída (`amount < 0`), usar `PIX enviado para <name>`.
- Se `paymentData.payer.name` existir e for entrada, usar `PIX recebido de <name>`.
- Guardar o `descriptionRaw` original em `raw` (já é preservado hoje) e um novo campo derivado `counterparty_name` na linha de staging para consulta rápida.
- Fallback: manter o texto atual quando não houver `payer/receiver`.

### 2. Coluna auxiliar (staging apenas)

Adicionar `counterparty_name text` em `pluggy_staging_transactions` (opcional, nullable) para acelerar filtros/exibição. Migration curta, sem alterar RLS existente.

### 3. Backfill dos 64 registros já sincronizados

Um `UPDATE ... SET description = ..., counterparty_name = raw#>>'{paymentData,receiver,name}'` para as linhas com `description ILIKE 'TRANSF %PIX%'` do usuário atual. Idempotente.

### 4. Frontend — `/contas-bancarias/conciliacao`

Na célula de descrição, mostrar `description` já enriquecido; se houver `counterparty_name`, exibi-lo em segunda linha menor (mesma linha do valor, tipografia secundária).

## O que NÃO muda

- Nenhuma alteração no motor de saldos, nas categorias, no schema de `transactions`, em RLS, em outras Edge Functions ou em outros bancos.
- Nenhum reprocessamento de webhook / re-sync remoto — o dado bruto já está no staging, o enriquecimento é local.

## Validação

1. Rodar o backfill e conferir na tela de conciliação que as linhas passam de `TRANSF ENVIADA PIX` para `PIX enviado para <nome>`.
2. Nova sincronização (`pluggy-sync-item`) para outra conta / novo período deve nascer já enriquecida.
3. Registros que já vinham descritivos (ex.: `NAGASUBIAS CORPORATE LTDA`, `BANCO SICOOB S.A.`) devem permanecer intactos.

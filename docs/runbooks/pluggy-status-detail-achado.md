# Achado — `status_detail` das conexões Pluggy é gravado incompleto

Data: 2026-09-15 · Escopo: diagnóstico, sem implementação de backend.

## Evidência no código

`supabase/functions/_shared/pluggy-v2-materialize.ts` (upsert de `pluggy_v2_connections`):

```ts
status_detail: item.error ? { error: item.error } : {},
```

Só `item.error` é preservado. O campo `statusDetail` do item (resumo por produto —
`accounts`, `transactions`, `creditCards`, `identity`, cada um com `isUpdated`,
`lastUpdatedAt`, `warnings`) é descartado.

`supabase/functions/_shared/pluggy-client.ts` (linhas 59-71) tipa `PluggyItem` sem
`statusDetail`, `executionReport` e `warnings`. **Correção do diagnóstico anterior:**
a ausência do campo na interface TypeScript não remove nada do JSON em runtime — o
`statusDetail` continua chegando na resposta. O descarte real acontece na
projeção/upsert de `pluggy-v2-materialize.ts` (linha acima); o tipo apenas esconde
o campo do autocompletar.

**Consequência:** `status_detail = {}` no banco **não** significa que a Pluggy não
informou detalhes; significa apenas que não havia `item.error`. Qualquer
diagnóstico de coleta parcial baseado nesse campo é inconclusivo hoje.

## Correção mínima proposta (não implementada)

1. Em `pluggy-client.ts`, acrescentar ao tipo `PluggyItem`:
   `statusDetail?: Record<string, { isUpdated?: boolean; lastUpdatedAt?: string | null; warnings?: unknown[] }>`.
2. Em `pluggy-v2-materialize.ts`, gravar um resumo seguro (sem dados financeiros,
   sem documentos, sem saldos), por exemplo:

```ts
status_detail: {
  ...(item.error ? { error: item.error } : {}),
  produtos: Object.fromEntries(
    Object.entries(item.statusDetail ?? {}).map(([produto, d]) => [
      produto,
      {
        atualizado: d?.isUpdated ?? null,
        atualizado_em: d?.lastUpdatedAt ?? null,
        avisos: Array.isArray(d?.warnings) ? d.warnings.length : 0,
      },
    ]),
  ),
  coletado_em: new Date().toISOString(),
}
```

Somente contadores e flags — nunca o conteúdo dos avisos, que pode carregar texto
do banco com dados do titular.

3. V1 (`pluggy_connections`) **não possui** coluna `status_detail` — espelhar o
   resumo ali exigiria migration própria, que não foi proposta nem aplicada. Item
   registrado apenas como possibilidade futura.

Nada disso foi aplicado nesta etapa (sem migrations).

## Diagnóstico da conexão consultada (somente leitura)

PRAIANOS BAR E RESTAURANTE LTDA · empresa `bab7a4ac-0b95-4b69-ba18-ac862bfb038b`
· item `fb6d3a3f-a959-4a15-821d-0ee1e9399c38`.

GET `/items/{id}` na Pluggy, via função existente `pluggy-admin-find-items`
(super admin, service role, sem refresh e sem escrita):

| Campo | Valor |
| --- | --- |
| status | `UPDATED` |
| executionStatus | `PARTIAL_SUCCESS` |
| conector | `Banco do Brasil Empresas` (id 662) |
| error | `null` |
| createdAt | 2026-08-24T19:04:18.806Z |
| updatedAt | 2026-09-15T21:41:41.254Z |

Banco (`pluggy_connections`, leitura): `status=updated`,
`execution_status=PARTIAL_SUCCESS`, `last_sync_status=partial_success`,
`last_synced_at=2026-09-15 21:42:18Z`, `next_sync_at=2026-09-15 22:42:51Z`,
`revoked_at` nulo, `last_error` nulo.

### Causa da coleta parcial (leitura de 2026-09-15 22:03Z)

Com o diagnóstico mínimo já disponível em `pluggy-admin-find-items` (item explícito,
UUID validado, somente esse item, só códigos padronizados):

| Produto | atualizado | atualizado em | avisos | códigos |
| --- | --- | --- | --- | --- |
| accounts | sim | 2026-09-15T21:41:41Z | 0 | — |
| transactions | sim | 2026-09-15T21:41:41Z | 0 | — |
| investments | sim | 2026-09-15T21:41:41Z | 0 | — |
| identity | sim | 2026-09-15T21:41:41Z | 0 | — |
| loans | sim | 2026-09-15T21:41:41Z | 0 | — |
| **creditCards** | **não** | 2026-09-08T00:07:14Z | **2** | **`004`** |
| investmentsTransactions | n/d | — | 0 | — |
| paymentData | n/d | — | 0 | — |

Conector: `Banco do Brasil Empresas` (id 662), `type=BUSINESS_BANK`,
`isOpenFinance=true`. `error_code` nulo, `consent_expires_at` nulo.

**Conclusão:** o `PARTIAL_SUCCESS` vem exclusivamente do produto `creditCards`,
com 2 avisos de código `004` e sem atualização desde 08/09. Contas, lançamentos,
investimentos, identidade e operações de crédito foram atualizados normalmente —
não há erro de credencial nem consentimento revogado, portanto **reconectar não
resolve**. Referências oficiais dos códigos:
<https://docs.pluggy.ai/docs/warnings-status-codes> e
<https://docs.pluggy.ai/docs/errors-validations>.

### Bloqueios remanescentes

- `executionReport` continua fora do retorno (não foi incluído nesta correção
  mínima, que se limitou a `statusDetail` por produto e a `connector.type` /
  `isOpenFinance`).
- As credenciais da Pluggy existem apenas como secrets das Edge Functions; não há
  acesso a elas fora do backend, então não houve chamada direta à API.

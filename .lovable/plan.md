## Causa

O CHECK `dp_bloqueio_regras_check` só permite `tipo = 'fixa_anual'` ou `'dinamica'`. O formulário salva `tipo = 'pos_pagamento'` (valor já existente no enum) → Postgres devolve `23514`.

## Correção

Migration única atualizando o CHECK para incluir o terceiro tipo:

```sql
ALTER TABLE public.dp_bloqueio_regras DROP CONSTRAINT dp_bloqueio_regras_check;
ALTER TABLE public.dp_bloqueio_regras
  ADD CONSTRAINT dp_bloqueio_regras_check CHECK (
    (tipo = 'fixa_anual'    AND mes IS NOT NULL AND dia IS NOT NULL)
 OR (tipo = 'dinamica'      AND regra_json IS NOT NULL)
 OR (tipo = 'pos_pagamento' AND regra_json IS NOT NULL)
  );
```

## Geração de novas datas

Não requer regeneração manual: o motor em runtime (`src/lib/dp/bloqueio-rules.ts` + triggers) já expande as regras ativas para todas as datas futuras disponíveis assim que a regra é salva. Datas passadas permanecem intactas; datas futuras ainda disponíveis passam a refletir a regra editada imediatamente.

## Verificação

- Editar "Bloqueio Pós-Pagamento" → PATCH retorna 204.
- Calendário Admin e Geral mostram as datas expandidas conforme a nova configuração.
- Regras `fixa_anual` e `dinamica` continuam salvando (mesmas condições preservadas).

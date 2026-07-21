## Problema

O trigger `dp_folgas_validar_self` está falhando com `COALESCE types uuid and boolean cannot be matched` na regra 5 (bloqueio manual):

```sql
IF FOUND AND COALESCE(v_bloq.liberada_por_solicitacao, false) = false THEN
```

A coluna `dp_datas_bloqueadas.liberada_por_solicitacao` é `uuid` (referência à solicitação que liberou), não boolean. O COALESCE tenta juntar `uuid` com `false` e explode.

## Correção

Migração ajustando a checagem para usar `IS NULL` (sem liberação = bloqueado):

```sql
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_self()
...
  -- 5) bloqueio manual
  IF FOUND AND v_bloq.liberada_por_solicitacao IS NULL THEN
    RAISE EXCEPTION 'Esta data está bloqueada administrativamente.'
      USING ERRCODE = 'check_violation';
  END IF;
...
```

Resto do trigger permanece idêntico. Sem alterações no frontend.
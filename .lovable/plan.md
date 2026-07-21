## Problema

A política `dp_folgas_self_insert` exige `private.is_company_member(auth.uid(), company_id)`, mas colaboradores DP não estão em `company_members` — eles são vinculados via `dp_colaboradores.user_id`. Resultado: o insert do próprio colaborador bate no RLS.

## Correção

Trocar a checagem de membership pela verificação de que o `company_id` do registro é o mesmo do colaborador do usuário:

```sql
DROP POLICY IF EXISTS dp_folgas_self_insert ON public.dp_folgas;

CREATE POLICY dp_folgas_self_insert
ON public.dp_folgas
FOR INSERT
TO authenticated
WITH CHECK (
  colaborador_id = public.dp_colaborador_of(auth.uid())
  AND company_id = (
    SELECT c.company_id FROM public.dp_colaboradores c
     WHERE c.id = public.dp_colaborador_of(auth.uid())
  )
  AND criado_por = auth.uid()
  AND origem = 'solicitacao'::dp_folga_origem
  AND extra = false
  AND tipo = 'normal'::dp_folga_tipo
  AND status = 'agendada'::dp_folga_status
);
```

Mesma correção espelhada em `dp_folgas_self_delete` para simetria (opcional — o delete já filtra pelo colaborador; mantém como está).

Sem alterações no frontend.
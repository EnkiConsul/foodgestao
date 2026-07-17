## Problema

Ao editar a **Data de vencimento** de qualquer lançamento **não recorrente / não parcelado**, o valor volta silenciosamente para o dia do `transaction_date` (competência). No caso de Energia: você troca 15/06 → 22/06, salva, e o banco grava 15/06.

## Causa raiz

A função `public.enforce_monthly_due_date_alignment()` (trigger BEFORE INSERT/UPDATE em `transactions`) tem um bug de tratamento de NULL em PL/pgSQL:

```sql
IF series_type NOT IN ('mensal','quinzenal') THEN
  RETURN NEW;  -- deveria dar early return para linhas sem série
END IF;
```

Quando o lançamento não é recorrente nem filho de parcelamento, `series_type` fica NULL. Em SQL, `NULL NOT IN (...)` avalia para **NULL** (não TRUE), então o `RETURN NEW` **não dispara**. A função continua e cai no ramo `ELSE` (lógica quinzenal), que recalcula `due_date` para o candidato mais próximo — sempre o mesmo dia do `transaction_date`.

Isso atinge todo lançamento único cujo vencimento esteja num dia diferente da competência.

## Correção (1 migration, sem mudança de código frontend)

Reescrever a função `enforce_monthly_due_date_alignment()` com o guarda de NULL explícito:

```sql
CREATE OR REPLACE FUNCTION public.enforce_monthly_due_date_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  series_type text;
  base_day int; due_day int; due_last int; target_day int;
  candidate_a date; candidate_b date;
BEGIN
  IF NEW.due_date IS NULL OR NEW.transaction_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_recurring IS TRUE AND NEW.recurrence_type IS NOT NULL THEN
    series_type := NEW.recurrence_type::text;
  ELSIF NEW.parent_transaction_id IS NOT NULL THEN
    SELECT recurrence_type::text INTO series_type
    FROM public.transactions WHERE id = NEW.parent_transaction_id;
  END IF;

  -- Guarda NULL-safe: sem série ⇒ não alinha
  IF series_type IS NULL OR series_type NOT IN ('mensal','quinzenal') THEN
    RETURN NEW;
  END IF;

  -- ... (restante da lógica de alinhamento mensal/quinzenal inalterada)
END;
$$;
```

Aplicar a mesma proteção `IS NULL OR` também em `enforce_weekly_due_date_alignment()` por prevenção (mesmo padrão de bug potencial).

## Passo pós-migração

Rodar um `UPDATE` corretivo opcional? **Não** — a correção é só para futuros saves. O valor atual de Energia (15/06) permanece; você poderá editar para 22/06 e agora vai persistir.

## Verificação

Após a migração eu executo o mesmo teste automatizado (PATCH → SELECT) e confirmo que o `due_date` respeita o valor enviado.

## Fora de escopo

Não mexer em código React, no fluxo de save do `TransactionFormDialog`, nem em outros triggers.

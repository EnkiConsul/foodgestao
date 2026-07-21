## Problema

O trigger `dp_folgas_validar_self` referencia `pa.status` e `pa.data_alvo` na regra 7 (aniversariante), mas a tabela `dp_prioridade_aniversario` só tem: `company_id, colaborador_id, ano, mes, prioridade, aniversariante`.

## Correção

Reescrever a regra 7 usando os campos reais + `dp_colaboradores.data_nascimento`:

- Busca `pa` do mês/ano da data pretendida, `aniversariante = true`.
- Compara o dia da `NEW.data` com o dia de `dp_colaboradores.data_nascimento` do colaborador priorizado.
- Bloqueia se o dono do aniversário for outro colaborador.

```sql
SELECT pa.colaborador_id
  INTO v_aniv
  FROM public.dp_prioridade_aniversario pa
  JOIN public.dp_colaboradores c ON c.id = pa.colaborador_id
 WHERE pa.company_id = NEW.company_id
   AND pa.ano = EXTRACT(YEAR FROM NEW.data)::int
   AND pa.mes = EXTRACT(MONTH FROM NEW.data)::int
   AND pa.aniversariante = true
   AND EXTRACT(DAY FROM c.data_nascimento) = EXTRACT(DAY FROM NEW.data)
 LIMIT 1;
IF FOUND AND v_aniv.colaborador_id <> NEW.colaborador_id THEN
  RAISE EXCEPTION 'Data reservada para aniversariante.' USING ERRCODE = 'check_violation';
END IF;
```

Resto do trigger permanece idêntico. Sem alterações no frontend.
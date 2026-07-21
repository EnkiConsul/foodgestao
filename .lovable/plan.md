## Diagnóstico

A folga de 23/08/2026 existe em `dp_folgas` (id `ef56f76a-cae8-4dd0-95d5-38f0b56fae2c`, status `agendada`), mas a política SELECT atual `dp_folgas_read_member` só libera leitura via `private.is_company_member(auth.uid(), company_id)`. A conta da colaboradora não está em `company_members` (rede confirma `[]`), apenas em `dp_colaboradores.user_id`. Resultado: o GET do calendário retorna `[]` e o dia não pinta, embora o INSERT tenha ido ao banco (o 409 posterior comprova).

## Correção

Migração adicionando política SELECT extra em `dp_folgas` para colaboradores lerem as folgas da sua própria empresa:

```sql
CREATE POLICY dp_folgas_read_colaborador
  ON public.dp_folgas
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT c.company_id
      FROM public.dp_colaboradores c
      WHERE c.id = public.dp_colaborador_of(auth.uid())
    )
  );
```

Como o Postgres combina políticas SELECT com OR, admins/membros continuam lendo pela política antiga e colaboradores passam a ler as folgas da empresa deles — necessário para pintar a própria folga, folgas fixas dos colegas e ocupação do dia no portal `/dp/meu/calendario`.

Nenhuma alteração no frontend: o refetch existente já renderiza o dia assim que o SELECT passar a retornar a linha.

## Fora de escopo

- Alterar `dp_folgas_admin_write`, `dp_folgas_self_insert` ou `dp_folgas_self_delete` — o bug é apenas de leitura.
- Migrar colaboradores para `company_members` — mudaria o modelo de acesso do módulo DP inteiro.
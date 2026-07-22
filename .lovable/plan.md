## Objetivo

Na página **Datas Bloqueadas** (`/dp/bloqueios`), quando uma data estiver **Liberada** (badge verde), exibir a ação **"Bloquear Novamente"** para restaurar o bloqueio original.

## Comportamento

- Linha **Liberada** (`liberada = true` ou `liberada_por_solicitacao != null`):
  - Mostrar botão **"Bloquear Novamente"** (ícone `Lock`, verde/rose).
  - Ao clicar, abrir `AlertDialog` de confirmação.
  - Se `regra_id` presente (override de regra automática): `DELETE` da linha em `dp_datas_bloqueadas` → a regra volta a valer em runtime.
  - Se manual liberado: `UPDATE ... SET liberada = false, liberada_por_solicitacao = null`.
  - Toast "Data bloqueada novamente" + invalidar `dp_datas_bloqueadas_admin`.
- Linha **Bloqueada** automática (regra): sem ações (comportamento atual).
- Linha **Bloqueada** manual: mantém Editar + Remover atuais.

## Alterações

1. **`src/lib/dp/bloqueios.ts`** — adicionar campo `liberada: boolean | null` em `DataBloq`.
2. **`src/pages/dp/DpBloqueios.tsx`**
   - Selecionar `liberada` na query `datasQ`.
   - Nova mutation `rebloquear` (delete se `regra_id`, update caso contrário) com invalidate.
   - Passar `onRebloquear` para `DataRow`.
3. **`src/components/dp/bloqueios/DataRow.tsx`**
   - Nova prop `onRebloquear(d: DataBloq)`.
   - Considerar `liberada` também via `d.liberada === true`.
   - Se `liberada`: renderizar botão "Bloquear Novamente" com `AlertDialog` de confirmação, no lugar de (ou junto de) editar/remover.

## Observações técnicas

- O motor de bloqueios em runtime (`dp_regra_bloqueia_data`) trata ausência de linha em `dp_datas_bloqueadas` como bloqueada quando a regra se aplica, então `DELETE` restaura o bloqueio automático corretamente.
- Nenhuma mudança de schema necessária (`liberada` já existe na tabela).

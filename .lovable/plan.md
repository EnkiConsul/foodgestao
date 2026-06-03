## Problema

Os campos numéricos no editor de planos (`PlanEditorDialog`) hoje impedem digitação fluida:

- "Valor por perfil adicional (R$)" e "Preço (R$)" formatam o valor com `.toFixed(2)` a cada tecla, então digitar "19,90" reescreve para "0.00" → cursor pula, vírgula é bloqueada, não dá pra apagar o zero.
- "Perfis inclusos", "Trial", "Ordem", "Máx. empresas/lançamentos/usuários/anexos" usam `parseInt` direto no `onChange` — apagar tudo vira `0`, não dá pra deixar o campo vazio enquanto digita.

## Solução

Permitir digitação livre nos campos numéricos do `PlanEditorDialog.tsx`, mantendo o valor numérico final consistente no `form`.

### Campos monetários (R$)
- Manter um estado local string (`priceReais` já existe; adicionar `extraReais`).
- `onChange` apenas atualiza a string (sem formatar nem converter).
- Aceitar vírgula ou ponto como separador decimal (normaliza no parse).
- `onBlur` reformata para 2 casas (`19,90`) e grava o valor em centavos no `form`.
- Ao abrir o diálogo, inicializar as strings com o valor atual formatado em pt-BR.

### Campos inteiros (trial, ordem, limites, perfis inclusos)
- Trocar o handler para aceitar string vazia/parcial sem forçar `0`.
- Converter para número apenas quando há dígito; se vazio, manter `""` no input e gravar `null`/`0` no form só no `onBlur`.
- Usar `inputMode="numeric"` para teclado correto no mobile.

### Observação
Mudança puramente de UX no formulário — não altera schema, RLS, payload salvo, nem a lógica de cobrança. O valor final continua sendo `price_cents` / `price_per_extra_company_cents` em centavos e os limites continuam inteiros.

## Arquivo afetado

- `src/components/admin/PlanEditorDialog.tsx`

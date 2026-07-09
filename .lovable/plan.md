## Objetivo
Permitir seleção múltipla nos filtros rápidos "Conta" e "Forma de Pagamento" da sidebar de Lançamentos.

## Mudanças

**`src/pages/Lancamentos.tsx`**
1. Trocar os estados `filterAccount` e `filterPaymentMethod` de `string` para `string[]` (padrão `[]` = todas).
2. Ajustar persistência (se existir em localStorage/URL) para arrays.
3. Substituir os `<Select>` únicos dos dois `FilterSection` por um novo componente de multi-seleção com checkboxes (baseado em Popover + lista com busca, seguindo o padrão visual denso já usado — `h-6 text-[11px]`).
   - Trigger mostra: "Todas" quando vazio, o nome quando 1 selecionado, "N selecionadas" quando >1.
   - Opção "Todas" limpa a seleção.
   - Cada item com checkbox; clique alterna.
4. Atualizar a lógica de filtragem (linhas ~536-537):
   - `if (filterAccount.length > 0 && !filterAccount.includes(t.account_id)) return;`
   - `if (filterPaymentMethod.length > 0 && (!t.payment_method_id || !filterPaymentMethod.includes(t.payment_method_id))) return;`
5. Ajustar o botão/contagem de "filtros ativos" (se houver badge) para considerar `.length > 0`.
6. Manter Categoria, Status, Tipo, etc. inalterados.

## Detalhes técnicos
- Componente inline `MultiSelectFilter` dentro do arquivo (ou pequeno componente novo em `src/components/lancamentos/MultiSelectFilter.tsx`) usando `Popover`, `Checkbox` e `Input` de busca — mesma densidade visual dos filtros existentes.
- Sem mudanças em backend, RPC, tipos ou outras páginas.
- Sem alteração no BulkEditDialog (continua single-select, pois é para aplicar valor único).
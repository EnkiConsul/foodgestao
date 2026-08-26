# Onboarding: usar a lista de módulos do código

## Por que ainda aparece "DP 360°"

A tela de seleção de módulos do onboarding não usa a lista de módulos do código (onde o nome já é "Pessoas 360°"). Ela lê a tabela do banco `modulos_catalogo`, que ainda tem os nomes e módulos antigos:

- `dp` → "DP 360°"
- `crm`, `rh`, `bi` → módulos que não existem no produto
- `ponto`, `folha` → desativados no produto, mas ativos no catálogo

## O que fazer

1. Trocar a fonte de dados de `StepModulos.tsx`: em vez do catálogo do banco, usar `MODULES` de `src/lib/modules.ts` — a mesma fonte usada pelo Hub e pela troca de módulos.
2. Exibir apenas módulos prontos: `available === true`. Isso resulta em:
   - Financeiro 360°
   - Pessoas 360°
   - Escala 360° (submódulo de Pessoas, marcado como "Extra" e dependente de Pessoas)
   Ponto, Folha, CRM, RH e BI desaparecem da tela.
3. Manter o comportamento do card (ícone, nome, descrição, seleção) usando os campos de `MODULES` (`icon`, `name`, `description`).
4. Regra de dependência: se Escala for selecionada, Pessoas é marcada automaticamente (Escala requer `dp`); ao desmarcar Pessoas, Escala também é desmarcada.
5. Garantir que a conclusão do onboarding continue recebendo os mesmos slugs (`financeiro`, `dp`, `escala`) que o backend já entende ao ativar módulos/trial.

## Detalhes técnicos

- `src/components/onboarding/food/StepModulos.tsx`: remover `useModulosCatalogo` e derivar a lista de `MODULES.filter(m => m.available)`; ordenar com pais antes dos submódulos.
- `src/components/onboarding/food/ModuloCard.tsx`: ajustar a tipagem das props para aceitar `{ slug, name, description, icon }` em vez do tipo do catálogo do banco (mantendo o visual atual e o selo "Extra").
- `src/pages/Onboarding.tsx`: aplicar a regra de dependência no `onToggle` (Escala implica Pessoas) e conferir a validação de "ao menos 1 módulo".
- Nenhuma mudança de banco é necessária; `modulos_catalogo` segue existindo para o backoffice.
- Depois da mudança, verificar a tela `/onboarding` no passo de módulos para confirmar os três cards corretos.

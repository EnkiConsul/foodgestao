# Onboarding: usar a lista de módulos do código (apenas módulos prontos e principais)

## Por que ainda aparece "DP 360°"

A tela de seleção de módulos do onboarding lê a tabela do banco `modulos_catalogo`, que ainda tem os nomes e módulos antigos. O código principal já tem a fonte correta em `src/lib/modules.ts` — lá o módulo DP se chama "Pessoas 360°" e os módulos que não existem (CRM, RH, BI, Ponto, Folha) estão marcados como não disponíveis.

## O que fazer

1. Trocar a fonte de dados de `StepModulos.tsx`: em vez do catálogo do banco, usar `MODULES` de `src/lib/modules.ts`.
2. Exibir apenas módulos **principais** prontos:
   - `available === true`
   - sem `parent` (não são submódulos)
   Resultado na tela:
   - Financeiro 360°
   - Pessoas 360°
   Ponto, Folha, CRM, RH, BI, Escala e Financeiro Pessoal não aparecem.
3. Ajustar a tipagem do `ModuloCard.tsx` para receber os campos do `MODULES` (`name`, `description`, `icon`, `slug`) e manter o visual atual (ícone, rótulo, descrição, checkbox circular).
4. Nenhuma mudança de banco. A tabela `modulos_catalogo` segue existindo para o backoffice, mas o onboarding deixa de depender dela.
5. Verificar `/onboarding` no passo de módulos após a mudança para confirmar os dois cards corretos: Financeiro 360° e Pessoas 360°.

## Detalhes técnicos

- `src/components/onboarding/food/StepModulos.tsx`: remover `useModulosCatalogo`; criar a lista estática a partir de `MODULES.filter(m => m.available && !m.parent)` e ordenar pela posição atual do array.
- `src/components/onboarding/food/ModuloCard.tsx`: trocar a prop `modulo: ModuloCatalogo` por uma interface local com `slug`, `name`, `description`, `icon`.
- A lógica de validação "ao menos 1 módulo" e a submissão para ativar o trial continuam usando os slugs selecionados; como os slugs são os mesmos (`financeiro`, `dp`), nada muda no backend.

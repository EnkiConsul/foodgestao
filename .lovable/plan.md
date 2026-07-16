## Objetivo

Reescrever `src/pages/dp/DpColaboradores.tsx` para replicar a estrutura/design da documentação (imagem de referência): header rico, card de filtros e tabela com colunas Colaborador, CPF, Cargo, Unidade, Vínculo, Status (switch), Perfil, Folha Ponto e Ações. Sem alterar cores da identidade (paleta 360°FOOD já em uso no `.dp-shell`).

## Mudanças

### 1. Header da página
- Título grande "Colaboradores" com ícone `Users` à esquerda (cor `primary`).
- Subtítulo: "Gerencie a equipe, cargos e acessos ao sistema."
- Do lado direito: `<FavoriteToggle />` (já existente) + botão vermelho `+ Novo Colaborador` (variant default herda tema DP).

### 2. Card de Filtros (novo)
Card único com 4 controles alinhados horizontalmente (labels em uppercase pequenas, como na imagem):
- **BUSCAR**: input com ícone lupa — filtra por nome/CPF/matrícula (mantém lógica atual).
- **UNIDADE**: `Select` populado via `useDpUnidades` (se existir; senão via `dp_unidades`), com opção "Todas".
- **STATUS**: `Select` com Todos / Ativos / Inativos.
- **CARGO**: `Select` populado via `useDpCargos` (ou `dp_cargos`), com opção "Todos".
Filtro combinado aplicado antes de renderizar a tabela.

### 3. Tabela
Substituir colunas atuais por:
| COLABORADOR | CPF | CARGO | UNIDADE | VÍNCULO | STATUS | PERFIL | FOLHA PONTO | AÇÕES |

- **Colaborador**: nome em negrito (uppercase como na doc).
- **CPF**: `c.cpf` formatado (usar util existente se houver; senão exibir cru).
- **Cargo**: `c.cargo_nome ?? c.cargo ?? "—"`.
- **Unidade**: `c.unidade_nome ?? "—"`.
- **Vínculo**: `Badge` com `c.regime` em maiúsculas (CLT/PJ/…), estilo outline azul-claro.
- **Status**: componente `Switch` (shadcn) ligado a `c.ativo`; on-change chama nova mutation `useToggleDpColaboradorAtivo` (adicionada em `useDpColaboradores.tsx`) que faz `update({ ativo }).eq('id', id)` e invalida a query.
- **Perfil**: `Badge` mostrando `c.perfil_acesso` (Colaborador/Admin). Cor sutil (secondary/outline).
- **Folha Ponto**: `Badge` "Sim" (verde suave) / "Não" (cinza), lendo `c.possui_folha_ponto`.
- **Ações**: 3 botões ghost com ícones — `Pencil` (editar), `KeyRound` (resetar/definir acesso — abre toast "em breve" por ora, pois não faz parte do escopo funcional atual), `Trash2` (remover, mantém AlertDialog atual).

### 4. Hook
Adicionar em `src/hooks/useDpColaboradores.tsx`:
```ts
export function useToggleDpColaboradorAtivo() { ... update ativo ... }
```
Nenhuma mudança nos demais hooks.

## Fora de escopo
- Não alterar cores/tokens globais (identidade 360°FOOD preservada).
- Não implementar de fato o fluxo "resetar acesso" (ícone chave) — apenas placeholder com toast, para preservar paridade visual sem introduzir back-end novo.
- Sem alterações em migrations, RLS ou outras páginas.

## Arquivos afetados
- `src/pages/dp/DpColaboradores.tsx` (reescrita)
- `src/hooks/useDpColaboradores.tsx` (novo hook de toggle)

## Risco de regressão
Baixo — mudança isolada a uma única página + adição aditiva de hook. Filtros e switch operam sobre campos já existentes na tabela `dp_colaboradores`.

# Ícone de ajuda (?) nas ações da tela de Categorias

Adicionar um ponto de interrogação ao lado de cada ação da barra de ferramentas em `/categorias`, explicando em texto simples o que a funcionalidade faz — com destaque para a diferença entre importar e substituir.

## O que o usuário vai ver

Ao lado de cada botão, um ícone discreto de interrogação. Ao passar o mouse (ou tocar, no mobile), abre uma explicação curta:

- **Nova categoria** — "Cria uma categoria do zero. Você pode criá-la dentro de um grupo existente para manter a hierarquia."
- **Importar plano 360°FOOD** — "Apenas adiciona. Traz as categorias do modelo padrão que ainda não existem na sua empresa. Nada é apagado: suas categorias, orçamentos, regras e os vínculos dos lançamentos continuam intactos."
- **Substituir pelo padrão** — "Reinicia a árvore de categorias. Os lançamentos são mantidos, mas ficam sem categoria; orçamentos e regras ligados às categorias atuais são apagados e o modelo padrão é recriado do zero. Use só para começar de novo."
- **Recolher tudo / Expandir tudo** — "Mostra ou esconde as subcategorias de todos os grupos de uma vez."
- **Filtros de status** — "Bloqueadas são categorias que servem apenas como grupo e não aceitam lançamentos."

No mobile, onde essas ações ficam no menu "Mais ações", cada item do menu ganha a mesma explicação em uma linha auxiliar abaixo do título, já que tooltip por hover não funciona bem em toque.

## Detalhes técnicos

1. Novo componente `src/components/ui/help-hint.tsx` (ou `src/components/common/HelpHint.tsx`): botão-ícone `HelpCircle` (lucide) com `aria-label`, envolvido em `Tooltip` + `Popover` para funcionar em desktop (hover/foco) e em toque (clique). Usa apenas tokens semânticos (`text-muted-foreground`), sem cores fixas.
2. `src/pages/Categorias.tsx`: inserir `HelpHint` ao lado de "Nova categoria", "Importar plano 360°FOOD", "Substituir pelo padrão", "Recolher/Expandir tudo" e do grupo de tabs de status; remover os `title=` atuais dos botões para não duplicar a dica.
3. No `DropdownMenuContent` do mobile, converter os itens em duas linhas (título + descrição em `text-xs text-muted-foreground`) mantendo os mesmos handlers e estados de loading.
4. Centralizar os textos em uma constante local (ex.: `CATEGORIA_HELP`) no próprio arquivo da página, para manter a redação consistente entre desktop e mobile.
5. Sem mudanças de dados, RPC ou regras de negócio — alteração puramente de interface.

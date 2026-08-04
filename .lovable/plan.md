# Ícone de ajuda (?) nas ações da tela de Categorias

Adicionar um ponto de interrogação ao lado de cada ação da barra de ferramentas em `/categorias`, com uma explicação curta e direta.

## Textos das dicas

- **Nova categoria** — "Cria uma categoria nova."
- **Importar plano 360°FOOD** — "Só adiciona o que falta do modelo padrão. Nada é apagado."
- **Substituir pelo padrão** — "Recria o modelo padrão do zero. Os lançamentos ficam sem categoria."
- **Recolher/Expandir tudo** — "Mostra ou esconde todas as subcategorias."
- **Filtro Bloqueadas** — "Categorias que são só grupo e não aceitam lançamentos."

## Detalhes técnicos

1. Novo componente `src/components/common/HelpHint.tsx`: ícone `HelpCircle` com `aria-label`, em `Tooltip` + `Popover` (funciona por hover no desktop e por toque no mobile), usando tokens semânticos.
2. `src/pages/Categorias.tsx`: inserir `HelpHint` ao lado de cada ação citada e remover os `title=` atuais para não duplicar a dica.
3. No menu "Mais ações" do mobile, exibir a mesma frase em linha auxiliar (`text-xs text-muted-foreground`) sob cada item.
4. Textos centralizados em uma constante local `CATEGORIA_HELP`.
5. Alteração apenas de interface — sem mudanças de dados ou regras.

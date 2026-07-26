## Problema

Na tela de revisão da importação em lote (`BulkReviewInline`, usada em Documentos/Contracheques/Ponto), o layout foi feito para desktop:

- A prévia do PDF é renderizada com escala fixa (`1.5 × zoom`), maior que a largura do celular. Como o contêiner tem rolagem, o usuário vê apenas uma faixa branca da margem da página — parece que "não carregou".
- O banner de status ocupa 3 linhas de texto e empurra os botões de zoom/abrir para fora da linha.
- O rodapé coloca a dica "Use ← / → para navegar" ao lado do botão principal, cortando o texto "Aprovar e Salvar 10 Documento(s)".
- Os controles de colaborador/competência/ignorar usam grid de 3 colunas que só quebra em `md`.

## O que será feito

Todas as mudanças são de UI/apresentação, sem alterar regras de negócio, OCR ou aprovação.

**1. Prévia do PDF ajustada à largura (fit-to-width)**
- Medir a largura real do contêrer da prévia e calcular a escala para a página caber inteira na largura disponível, multiplicada pelo zoom do usuário (zoom 100% = página inteira visível na largura).
- Re-renderizar ao redimensionar/rotacionar a tela.
- Altura do contêiner passa a ser adaptativa (`~55vh` no mobile, `70vh` no desktop) com fundo neutro e a página centralizada.
- Indicador "Renderizando…" posicionado corretamente (hoje usa `absolute` sem pai relativo, ficando solto).

**2. Barra de status e ferramentas**
- No mobile: status em uma linha própria (texto compacto, com reticências quando longo) e a barra de zoom / abrir em nova aba em uma segunda linha alinhada à direita.
- Badges (Competência, Duplicado, Inativo) passam a quebrar linha em vez de espremer o texto.
- Adicionar botão "ajustar à largura" (reset de zoom) junto de − / +.

**3. Navegação entre páginas**
- Barra de navegação compacta no mobile: setas em botões-ícone com área de toque de 40px e o indicador "3 / 10" centralizado.

**4. Rodapé de aprovação**
- No mobile o botão "Aprovar e Salvar N Documento(s)" passa a ocupar a largura total, em linha própria, com texto encurtado ("Aprovar 10 documentos") quando necessário.
- A dica de teclado "Use ← / →" fica oculta no mobile (não se aplica a toque).

**5. Editor de vínculo**
- Grid passa a ser 1 coluna no mobile (colaborador, competência, ações empilhados), com o botão "Ignorar" em largura total e o campo de colaborador sem estourar a linha.

**6. Paridade na tela cheia**
- Aplicar o mesmo cálculo de escala fit-to-width e o mesmo rodapé responsivo em `BulkReviewDialog` (modo tela cheia), que hoje usa escala fixa `1.5`.

## Detalhes técnicos

- Arquivos: `src/components/dp/documentos/BulkReviewInline.tsx` e `src/components/dp/documentos/BulkReviewDialog.tsx`.
- Escala: `scale = (containerWidth - padding) / pageViewportWidth * zoom * dpr`, com `dpr` limitado a 2 (já existente), usando `ResizeObserver` no contêiner da prévia.
- Breakpoints via classes Tailwind (`sm:`/`md:`) e o hook existente `use-mobile` quando for necessário lógica condicional (texto do botão).
- Sem alterações em Edge Functions, RLS ou consultas.

## Verificação

Rodar a tela em viewport 390–407px com Playwright e conferir: página do PDF visível por inteiro na largura, nenhum overflow horizontal, botão de aprovação com texto completo.

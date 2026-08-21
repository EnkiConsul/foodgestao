# Pessoas 360° — revisão completa da versão mobile

Avaliei o módulo em 407px (com sessão real) e o padrão de código das 55 páginas. Os problemas não são de páginas isoladas: eles vêm de 4 componentes-base compartilhados por todo o módulo. Corrigindo a base, todas as telas melhoram de uma vez; depois faço as correções pontuais que sobram.

## O que está errado hoje (observado)

- **Cabeçalho**: título grande + botões de ação em tamanho cheio ocupam quase 1/4 da tela antes de qualquer conteúdo (ex.: Colaboradores com "Lixeira" + "Novo Colaborador").
- **Filtros**: o card de filtros (usado em 22 telas) empilha rótulo + campo full-width; em Colaboradores os filtros ocupam uma tela inteira e a primeira linha da lista só aparece após rolar.
- **KPIs**: rótulos em caixa alta quebram em 2 linhas ("Colaboradores Ativos", "Trocas Pendentes"), ícone às vezes à esquerda, às vezes à direita, altura desalinhada entre os cards da mesma linha (visto em Folgas e no Painel).
- **Tabelas**: 4 telas ainda mostram tabela dentro de rolagem horizontal no celular (Lixeira, Escalas, Conformidade DSR, Configurações).
- **Abas**: cada tela resolve o excesso de abas de um jeito diferente (`w-full`, `w-max`, `flex-wrap`, `grid-cols-2`) — algumas cortam abas, outras viram duas linhas.
- **Diálogos**: só 3 dos 51 diálogos do módulo usam o padrão de tela cheia com cabeçalho/rodapé fixos; os demais viram caixas com rolagem dupla no celular.
- **Grades fixas**: `grid-cols-3` / `grid-cols-7` sem variante mobile em telas do portal e em diálogos (Meu Ponto, Meu Perfil, Minha Escala, Convocações, Unidade, Bloqueios) espremem campos.
- **Barra inferior**: conteúdo final fica atrás do menu inferior/banner em algumas telas com rodapé de ações.

## Plano

### Fase 1 — Base compartilhada (afeta as 55 telas)
- `DpPage.tsx`: cabeçalho mobile mais compacto (título menor, descrição em 1 linha, ações em linha rolável com botões de altura reduzida e ícone-primeiro quando o rótulo for longo).
- Novo padrão de filtros: no mobile o `DpFilterCard` colapsa em uma barra "Busca + Filtros (n)" que abre uma folha inferior com os campos; no desktop nada muda.
- Novo `DpStatCard`: rótulo em duas linhas no máximo, sem caixa alta forçada, ícone sempre na mesma posição, altura igual entre cards, 2 colunas no mobile.
- Padronizar `TabsList` do módulo em um único componente rolável horizontal com rolagem por toque e indicação de corte.
- Padronizar `DialogContent` do módulo: tela cheia no mobile, cabeçalho e rodapé fixos, corpo rolável (mesmo padrão já usado em Configuração de trabalho).

### Fase 2 — Telas administrativas
- Converter as 4 tabelas restantes em lista de cartões no mobile (mantendo tabela no desktop).
- Revisar as telas de maior uso com o novo padrão: Colaboradores, Folgas, Calendário/Escala do mês, Operação do Dia, Ponto e Ponto do Time, Folha e período, Atestados, Aprovações, Documentos, Cadastros (Turnos, Cargos, Unidades, Sindicatos, Adicionais).
- Ajustar as grades fixas para 1–2 colunas no mobile.

### Fase 3 — Portal do colaborador
- Meu Home, Meu Ponto, Minha Escala, Meu Perfil, Contracheque, Documentos, Solicitações, Trocas, Convocações, Mural: grades responsivas, cartões com ação principal alcançável pelo polegar, e espaçamento inferior suficiente para o menu inferior.

### Fase 4 — Verificação
- Capturar todas as rotas do módulo em 390px e 407px e conferir ausência de rolagem horizontal, botões com área de toque ≥ 40px e nenhum texto cortado.
- Rodar os testes existentes (incluindo `mobileNav.parity.test.ts`) para garantir que nada de navegação regrediu.

## Detalhes técnicos

- Nada de lógica de negócio muda: apenas componentes de apresentação, classes utilitárias e composição.
- Cores e sombras continuam via tokens (`hsl(var(--dp-*))`), sem classes de cor fixas.
- Novos componentes ficam em `src/components/dp/` (`DpStatCard.tsx`, `DpFilters.tsx`, `DpTabsBar.tsx`, `DpDialogShell.tsx`) e são adotados página por página, sem quebra de API.
- Telas ocultas pelo painel de desenvolvimento (Ponto, Folha, Benefícios estão ocultas no momento) serão ajustadas pelo código e verificadas com a ocultação temporariamente desativada na visualização.

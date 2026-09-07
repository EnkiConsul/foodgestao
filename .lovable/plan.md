# Pessoas 360° — Fase 1: componentes base mobile

Só a Fase 1. Nada de Fase 2, nada de testes automatizados.

## Situação atual (verificada)

Boa parte do kit base já existe, mas incompleto e pouco adotado:

- `DpPage` / `DpPageHeader`: cabeçalho no celular ainda coloca todas as ações numa fila com rolagem lateral — exatamente o padrão que você pediu para evitar.
- `DpFilters`: já faz "Busca + Filtros" com painel inferior no celular. Falta contador confiável e chips de filtros ativos.
- `DpTabsBar`: só rola as abas na horizontal. Falta o seletor de seção quando há muitas abas.
- `DpStatCard` / `DpStatGrid`: prontos e adequados (2 colunas no celular).
- `DpDialogShell`: tela cheia no celular com cabeçalho/rodapé fixos — pronto, mas usado em pouquíssimas telas (42 diálogos do módulo abrem `DialogContent` direto).
- Não existe padrão de cartão de lista com ação principal + menu, nem rodapé fixo de formulário respeitando a barra do sistema.

## O que a Fase 1 entrega

### 1. Cabeçalho (`DpPageHeader`)
No celular: título, descrição em uma linha e abaixo uma faixa de ações com **1 ação principal em largura cheia + botão "Mais"**. As demais ações vão para o menu "Mais". No desktop nada muda. As telas indicam a ação principal; as outras entram no menu automaticamente.

### 2. Ações (novo `DpActions`)
Componente único que recebe a lista de ações e decide: no celular, principal + menu; no desktop, todos os botões lado a lado. Toda ação continua acessível — só muda de lugar.

### 3. Abas / seções (`DpTabsBar`)
Com até 3 abas curtas continua faixa de abas. Com mais que isso, no celular vira um seletor de seção ("Calendário ▾") que abre a lista das seções num painel inferior. Desktop segue com abas.

### 4. Filtros (`DpFilters`)
- Contagem automática dos filtros ativos.
- Chips compactos dos filtros aplicados abaixo da busca, cada um removível.
- Botão "Filtros" com área de toque de 44px.

### 5. Listas e tabelas (novo `DpDataList` + cartão padrão)
Padrão reutilizável: no desktop tabela; no celular cartão com nome em destaque, 2–3 linhas de apoio, selos de situação e ações `[Ver] [⋮]`. Regra: até 3 colunas simples pode seguir tabela; 4+ colunas ou ações compostas viram cartões.

### 6. Diálogos, painéis e rodapé de formulário
- `DpDialogShell` ganha variante para formulários longos e respeita a barra inferior do sistema.
- Novo `DpFormFooter`: rodapé fixo com Cancelar/Salvar sempre visível, inclusive com o teclado aberto.
- Ajuste no `Dialog` base do módulo para nunca passar da altura da tela (altura por `100dvh`).

### 7. Área de toque e largura
Revisão do kit para 44px mínimo em botões e ícones clicáveis, `w-full` em campos e listas, e correção de larguras fixas (`w-64`, `w-80`) sem variação para celular nos componentes compartilhados.

### 8. Aplicação em telas representativas (amostra)
Para provar o padrão, aplico em três telas apenas:
- Colaboradores (busca + filtros + cartões + ações no menu);
- Folgas (seletor de seção + calendário/lista);
- um diálogo de formulário longo (cadastro de colaborador) com rodapé fixo.

Isso já melhora indiretamente todas as telas que usam o kit.

## Verificação
- Conferência visual no preview em 320, 360, 390, 430 e 768px: sem rolagem lateral, sem botão cortado ou sobreposto, títulos legíveis.
- Comparação desktop x celular nas três telas da amostra: toda função do desktop presente no celular.
- `npx vite build`, `npm run lint`, `npm run typecheck:strict`.
- Nenhum teste automatizado criado ou executado.

## Detalhes técnicos
- Arquivos base: `src/components/dp/DpPage.tsx`, `DpFilters.tsx`, `DpTabsBar.tsx`, `DpDialogShell.tsx`, `DpStatCard.tsx`, `MobileCardKit.tsx`; novos `DpActions.tsx`, `DpDataList.tsx`, `DpFormFooter.tsx`, `DpSectionSelect.tsx`.
- Sem mudança de API quebrada: as props atuais continuam válidas; os novos comportamentos entram por props opcionais (`primaryAction`, `moreActions`, `chips`, `sectionSelect`).
- Apenas camada de apresentação: nenhuma regra de negócio, consulta, permissão ou migração de banco.
- Cores e sombras via tokens (`hsl(var(--dp-*))`); nada de classes de cor fixas.
- `env(safe-area-inset-bottom)` nos rodapés fixos; alturas de diálogo em `100dvh`.

## Fora de escopo nesta fase
Navegação do módulo (Fase 2), telas P0/P1/P2 além da amostra, Portal do colaborador, redesenho visual e qualquer mudança de funcionalidade.

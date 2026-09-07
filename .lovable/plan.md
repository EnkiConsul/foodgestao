# Pessoas 360° — Fase 3: adoção do kit nas demais telas

Com a Fase 1 (componentes base) e a Fase 2 (navegação) concluídas, a Fase 3 espalha o kit pelo módulo inteiro. Nada de funcionalidade nova — só levar o padrão mobile para as telas e diálogos que ainda abrem fora da casca.

## Situação atual

- O kit (`DpPage`, `DpActions`, `DpDataList`/`DpListCard`, `DpFilters` com chips, `DpTabsBar` com seletor de seção, `DpDialogShell`, `DpFormFooter`) só está aplicado em Colaboradores, Folgas e no cadastro do colaborador.
- **39 diálogos do módulo** ainda abrem `DialogContent` direto, sem cabeçalho/rodapé fixos e sem respeitar a barra do sistema no celular.
- A tabela desktop de Colaboradores ainda não foi envolvida em `DpDataList`, e os painéis das abas de Folgas não foram revisados para celular.

## O que a Fase 3 entrega

### 1. Diálogos migrados para a casca padrão
- Migrar os 39 diálogos para `DpDialogShell`: tela cheia no celular, cabeçalho e rodapé fixos, altura em `100dvh`, respeito à barra inferior do sistema.
- Formulários longos ganham `DpFormFooter` (Cancelar/Salvar sempre visível).
- Prioridade de execução: primeiro os de uso diário (turnos, escalas, convocações, trocas, ocorrências, férias, benefícios), depois os de cadastro e configuração.

### 2. Listas e tabelas no padrão `DpDataList`
- Telas com tabela de 4+ colunas ou ações compostas viram cartões no celular com `[Ver] [⋮]`; desktop segue em tabela.
- Inclui terminar Colaboradores (tabela dentro de `DpDataList`) e revisar as listas de Cargos, Unidades, Turnos, Benefícios, Convocações, Ocorrências, Férias e Relatórios.

### 3. Abas e painéis restantes
- Telas com mais de 3 seções ganham o seletor de seção no celular (mesmo padrão de Folgas).
- Revisão dos painéis das abas de Folgas e das demais telas com abas (escalas, ponto, configurações) para celular: sem rolagem lateral, botões com 44px.

### 4. Filtros e cabeçalhos padronizados
- Telas com busca/filtro passam a usar `DpFilters` com contagem automática e chips removíveis.
- Cabeçalhos com ação principal em largura cheia + menu "⋮" no celular (`actionItems`/`DpActions`).

## Verificação
- Conferência visual no preview em 320, 390 e 430px nas telas migradas: sem rolagem lateral, sem botão cortado, rodapé de formulário sempre visível.
- `npx vite build`, `npm run lint`, `npm run typecheck:strict`.
- Nenhum teste automatizado criado ou executado (convenção do projeto).

## Detalhes técnicos
- Base: `src/components/dp/DpDialogShell.tsx`, `DpFormFooter.tsx`, `DpDataList.tsx`, `DpActions.tsx`, `DpFilters.tsx`, `DpTabsBar.tsx`.
- Apenas camada de apresentação: nenhuma regra de negócio, consulta, permissão ou migração de banco.
- Cores e sombras via tokens; `env(safe-area-inset-bottom)` em rodapés fixos.

## Fora de escopo nesta fase
Portal do colaborador (`/dp/meu/*`), redesenho visual e qualquer mudança de funcionalidade.

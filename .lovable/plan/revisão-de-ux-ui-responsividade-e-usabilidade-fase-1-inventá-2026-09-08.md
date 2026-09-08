# Revisão de UX/UI, Responsividade e Usabilidade — Fase 1 (Inventário) e divisão das fases

Sem mudança de regra de negócio, cálculo, permissão, integração ou banco em nenhuma fase. Somente apresentação.

## Fase 1 — Inventário (o que já foi levantado no código)

### Mapa de calendários

| # | Área | Tela / rota | Arquivo | Grade de 7 colunas hoje | Já tem lista no mobile? | Converter |
|---|---|---|---|---|---|---|
| 1 | Pessoas — Gestor | Calendário de Folgas (`/dp/folgas`) | `src/pages/dp/DpFolgas.tsx` + `FolgaCalendarShared.tsx` | grade só no desktop (`hidden md:grid`) | Sim | Referência do padrão |
| 2 | Pessoas — Gestor | Calendário administrativo (`/dp/calendario`) | `src/pages/dp/DpAdminCalendario.tsx` | desktop | Sim (`CalendarioMobileLista`) | Só ajuste fino |
| 3 | Portal | Meu Calendário (`/dp/meu/calendario`) | `src/pages/dp/portal/DpMeuCalendario.tsx` | desktop | Sim (`CalendarioMobileLista`) | Só ajuste fino |
| 4 | Pessoas — Gestor | Rotina do Mês (`/dp/escalas/mes`) | `src/pages/dp/DpOperacaoPanorama.tsx` (linhas ~1149) | Sim, também no mobile | Não | **Prioridade 1** |
| 5 | Pessoas — Gestor | Férias — calendário da equipe | `src/components/dp/ferias/FeriasCalendarioPanel.tsx` | Sim, também no mobile | Não | **Prioridade 1** |
| 6 | Pessoas — Gestor | Convocações (planejamento e disponibilidade) | `MonthGridCalendar.tsx`, `PlanejamentoPainel.tsx`, `DisponibilidadePainel.tsx` | Sim, também no mobile | Não | **Prioridade 1** |
| 7 | Portal | Minha disponibilidade | `src/components/dp/MinhaDisponibilidadeCard.tsx` | Sim, também no mobile | Não | **Prioridade 2** |
| 8 | Pessoas — Gestor | Memória do vale (benefícios) | `src/components/dp/beneficios/ValeMemoriaDialog.tsx` | Sim, dentro de diálogo | Não | **Prioridade 2** |
| 9 | Financeiro | Fluxo de Caixa (série diária, não é grade mensal) | `src/pages/FluxoCaixa.tsx` | Não é calendário em grade | — | Sem conversão |
| 10 | Compartilhado | Seletor de data (date picker) | `src/components/ui/calendar.tsx` | Grade, mas é seletor de data | — | Sem conversão (mantém) |

`RegraDialog` e `FichaRevisaoCard` usam grades de 7 colunas que não são calendário mensal — apenas revisão de espaçamento.

### Padrões compartilhados a reutilizar
- Lista de dias no mobile: `CalendarioMobileLista` (já pronto, usado em 2 telas) e o comportamento do Calendário de Folgas como referência.
- Listas: `DpDataList` + `DpListCard`, `ResponsiveDataTable`.
- Filtros, abas, indicadores e diálogos: `DpFilters`, `DpTabsBar`, `DpStatCard`/`DpStatGrid`, `DpDialogShell`, `MobileCardKit` — existem e estão pouco usados; serão adotados nas fases seguintes.

### Riscos de responsividade já visíveis
- Rotina do Mês, Férias e Convocações com células minúsculas em 360 px.
- Cabeçalhos com título, filtros e ações na mesma linha em várias telas do gestor.
- Tabelas largas do Financeiro dependentes de arraste lateral no celular.
- Títulos fora do padrão (só a primeira palavra maiúscula) espalhados pelas telas.

## Divisão das fases (uma por vez, com validação sua entre elas)

1. **Fase 2 — Calendários no mobile (aprovada como próxima):** itens 4, 5, 6, 7 e 8 do mapa passam a exibir 1 dia = 1 linha/bloco no mobile e tablet estreito, reutilizando o padrão de Folgas; desktop mantém a grade. Navegação de mês, filtros, cliques e ações preservados.
2. Fase 3 — Pessoas 360°, Portal do Gestor: cabeçalhos, filtros, tabelas/cards, abas, diálogos e formulários.
3. Fase 4 — Portal do Colaborador: experiência mobile de ponta a ponta.
4. Fase 5 — Financeiro: painel, lançamentos, contas a pagar/receber, contas, cartões, conciliação, relatórios.
5. Fase 6 — Consistência final: títulos, microcopy, estados vazios, carregamento, erros, acessibilidade e área de toque.

## Regra de títulos adotada
Páginas e cabeçalhos em Iniciais Maiúsculas (ex.: Rotina do Mês, Contas a Pagar). MAIÚSCULAS somente em selos e rótulos de seção curtos. Textos, descrições, rótulos de campo e botões seguem português normal.

## Detalhes técnicos
- Conversão dos calendários por `useIsMobile` / breakpoints Tailwind, mantendo o mesmo estado, os mesmos handlers e os mesmos dados; nenhuma consulta, RPC ou cálculo alterado.
- Extração do padrão de lista para reuso a partir de `CalendarioMobileLista`, adicionando apenas as props de conteúdo por dia que cada tela já possui.
- Validação com Playwright em 360/390/412 px e 1280/1366/1440/1920 px: sem rolagem horizontal de página, sem colisão de elementos, sem erros de console; typecheck e suíte de testes ao fim de cada fase.

## Fora do escopo
Novas funcionalidades, novos indicadores, redesign de identidade, mudanças de banco, integrações e regras trabalhistas/financeiras. Oportunidades encontradas serão registradas como sugestão futura.

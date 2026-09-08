# Revisão de UX/UI, Responsividade e Usabilidade — Fase 3

Pessoas 360° e Portal do Gestor: cabeçalhos, filtros, tabelas/cards, abas, diálogos e formulários.

## Escopo

Apenas apresentação. Sem mudança de regra de negócio, cálculo, permissão, integração ou banco.

## Objetivo

Padronizar a experiência mobile e desktop nas telas de gestão de pessoas, eliminando rolagem horizontal, quebras de layout, títulos fora do padrão e componentes mal aproveitados.

## Entregáveis

1. **Cabeçalhos de página**
   - Título + descrição/breadcrumbs em uma coluna.
   - Filtros e ações em linha separada, quebrando em `sm`/`md` quando necessário.
   - Ações primárias sempre visíveis; secundárias agrupadas em menu ou botões de texto.

2. **Filtros e abas**
   - Reutilizar `DpFilters` e `DpTabsBar` onde hoje filtros são inline.
   - Filtros em painel colapsável no mobile e barra horizontal rolável quando couber.
   - Abas não quebram layout; usam scroll horizontal ou dropdown no mobile.

3. **Tabelas vs. cards**
   - Tabelas largas (`ResponsiveDataTable`) devem ter scroll interno no mobile, nunca rolagem de página.
   - Onde já houver cards, adotar `DpDataList` + `DpListCard` com ações de swipe/menu.

4. **Diálogos, drawers e formulários**
   - Diálogos de cadastro/editar devem ter `max-w` adequado e quebra de colunas em mobile.
   - Drawers usarem largura total em `sm` e `md:w-[420px]`/etc. nos demais breakpoints.
   - Formulários de duas colunas viram uma coluna em `lg` ou menor conforme o conteúdo.

5. **Títulos e microcopy**
   - Padronizar todos os títulos de página, diálogo, drawer e aba para Iniciais Maiúsculas.
   - Não alterar selos, rótulos de seção curta e status, que já seguem o padrão aprovado.

## Telas incluídas (será confirmado no código antes de editar)

- Colaboradores e lixeira (`/dp/colaboradores`, `/dp/colaboradores/lixeira`)
- Folgas (`/dp/folgas`)
- Rotina do Mês / Escala (`/dp/escalas/mes`)
- Férias (`/dp/ferias`)
- Convocações (`/dp/convocacoes`, `/dp/disponibilidade`)
- Ocorrências (`/dp/ocorrencias`)
- Ponto, ajustes e apuração (`/dp/ponto`, `/dp/ponto/ajustes`, `/dp/ponto/apuracao`)
- Folha (`/dp/folha`, `/dp/folha/provisoes`, `/dp/folha/relatorios`)
- Rescisões (`/dp/rescisoes`)
- Documentos e pendências (`/dp/documentos`, `/dp/pendencias`)
- Cargos, unidades, turnos, categorias e perfis de acesso
- Configurações e modelos de mensagem

## Validação

- Playwright em 360/390/412 px e 1280/1366/1440 px.
- Sem rolagem horizontal de página, sem colisão de elementos, sem novos erros de console.
- `typecheck` e suíte de testes ao final da fase.

## Fora do escopo

Novas funcionalidades, mudanças de banco, integrações, regras trabalhistas/financeiras e refatoração de lógica de estado.

## Próxima fase (após aprovação desta)

Fase 4 — Portal do Colaborador: experiência mobile de ponta a ponta.

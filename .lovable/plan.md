# Pessoas 360° — Fase 3: telas administrativas no celular

As Fases 1 (kit base) e 2 (navegação) estão no ar. A **Fase 3** aplica o kit nas telas administrativas do módulo — hoje apenas 3 telas usam o padrão novo, e 13 telas ainda mostram tabela com rolagem lateral no celular.

## O que muda

### 1. Listas em cartões (13 telas)
Onde hoje a tabela desliza para o lado no celular, passa a aparecer cartão com nome em destaque, 2–3 linhas de apoio, selos de situação e `[Ver] [⋮]`. No desktop a tabela continua igual.

Telas: Escalas, Conformidade, Conformidade DSR, Configurações, Histórico Completo, Pessoas de Apoio, Modelos de Mensagem, Notificações, Analytics, Lixeira de Colaboradores, Atestados, Disciplinares, Ocorrências.

### 2. Cabeçalho e ações
Todas as telas administrativas passam a declarar a ação principal; as demais vão para o menu "⋮" — fim da fila de botões rolando de lado.

### 3. Filtros
Adoção do padrão "Busca + Filtros (n)" com chips removíveis nas telas que hoje empilham filtros em tela cheia: Atestados, Ocorrências, Disciplinares, Histórico, Ponto, Folha, Convocações, Solicitações, Trocas, Férias.

### 4. Abas
As telas com muitas abas (Cargos, Férias, Cadastro, Comunicação, Folha) ganham o seletor de seção no celular, igual ao de Folgas.

### 5. Janelas de formulário
Conversão dos diálogos mais usados para a casca padrão (tela cheia no celular, cabeçalho e rodapé fixos, Salvar sempre visível): Turno, Cargo, Unidade, Sindicato, Benefício, Atestado, Ocorrência, Disciplinar, Aviso, Bloqueio, Regras de Folga, Convocação, Férias, Rescisão. As demais janelas seguem na fase 4.

### 6. Grades apertadas
Correção das grades de 3+ colunas sem variante para celular nas telas administrativas (Unidade, Bloqueios, Configurações, Ponto).

## Verificação
- Conferência visual em 320, 390 e 430px em todas as telas alteradas: sem rolagem lateral, sem texto cortado, botões com 44px.
- `npx vite build`, `npm run lint`, `npm run typecheck:strict`.
- Sem testes automatizados novos ou executados.

## Detalhes técnicos
- Adoção de `DpDataList`/`DpListCard`, `DpActions`/`actionItems`, `DpFilters` com `chips`, `DpTabsBar` com `sections`, `DpDialogShell` e `DpFormFooter` nos arquivos de `src/pages/dp/**` e `src/components/dp/**`.
- Somente camada de apresentação: nenhuma regra de negócio, consulta, permissão ou migração de banco.
- Cores por tokens (`hsl(var(--dp-*))`), `env(safe-area-inset-bottom)` nos rodapés, alturas de diálogo em `100dvh`.

## Fora de escopo
Portal do colaborador (Fase 4), redesenho visual e qualquer mudança de funcionalidade.

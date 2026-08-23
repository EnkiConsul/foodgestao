# Menu único "Rotina"

Unificar o grupo "Rotina do Dia" com "Folgas e Férias" em um único grupo chamado **Rotina** na navegação do módulo Pessoas 360° (sidebar desktop, menu "Mais" mobile e atalhos).

## O que muda

Um grupo só, com hub em Operação do Dia, na ordem:

1. Operação do Dia
2. Escala do Mês
3. Gerar Escala
4. Convocações
5. Calendário Geral
6. Solicitações
7. Aprovações
8. Trocas
9. Férias
10. Datas Bloqueadas
11. Regras de Folgas
12. Conformidade DSR

Nenhuma tela é removida, renomeada ou tem rota alterada — apenas o agrupamento e o rótulo do menu.

## Detalhes técnicos

- `src/config/dpNavigation.tsx`: fundir os grupos `rotina-dia` e `folgas-ferias` em um único `DpNavGroup` com `id: "rotina"`, `label: "Rotina"`, `icon: CalendarClock`, `hubTo: "/dp/operacao"`, unindo os `matchPrefixes` dos dois grupos e concatenando os `items` na ordem acima (mantendo `end`, `shortcut` e `shortLabel` atuais).
- Sidebar (`DpSidebar.tsx`) e menu "Mais" (`mobileNav.tsx`) derivam desse config — não precisam de alteração.
- Ordem personalizada do menu (`useDpMenuLayout`) é salva por slug; o novo id `rotina` cai no padrão e os ids antigos salvos são simplesmente ignorados.
- Teste de paridade `mobileNav.parity.test.ts` deve continuar passando, pois o conjunto de rotas não muda.

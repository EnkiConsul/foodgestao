# Plano — Tela "Calendário" (Rotina) unificada

Nova tela **Calendário** dentro do menu **Rotina**, juntando Calendário de Folgas, Rotina da Loja (Painel da Operação) e Calendário de Férias. As telas atuais **continuam iguais**; depois que você validar, decidimos onde fica e o que sai.

## 1. Visão Mensal
- Navegação de mês, seletor de unidade e botão "Hoje".
- Cada dia mostra **só as pessoas ausentes** (nome curto + cor por tipo) e um alerta quando o dia está abaixo do mínimo de cobertura.
- **Filtros de visibilidade** (todos marcados por padrão, escolha lembrada por usuário):
  Folgas (fixa, variável, troca) · Férias (gozo e marcadas) · Faltas · Atestados · Afastamentos/licenças · Demais ausências (bloqueios, indisponibilidades).
- Botões rápidos "Marcar todos" / "Só este tipo".
- Clicar no dia abre a Visão do Dia.

## 2. Visão do Dia
Cabeçalho com data, resumo (trabalham, ausentes, convocados, descoberto) e navegação para dia anterior/seguinte. Três blocos:

1. **Quem trabalha, por setor** — agrupado por setor do dia, com horário/turno, selo de folguista, apoio de outra unidade, "Troca" e "setor alterado hoje". Cada pessoa tem ação **Alterar setor deste dia** (reaproveita o diálogo atual: vale só para a data, não muda o cadastro, motivo opcional).
2. **Mão de obra extra** — convocações (aceita / aguardando aceite / recusada), pessoas em teste, freelancers e folguistas do dia.
3. **Ausências** — folgas, férias, faltas, atestados, afastamentos e bloqueios, com origem (troca, solicitação, registro do gestor).

**Ações do gestor no dia** (mesmos fluxos da tela de Operação, sem duplicar regras):
- Registrar ausência (falta, atestado, folga extra etc.).
- Registrar mão de obra extra (convocar intermitente, pessoa em teste, freelancer/avulso).
- Alterar setor de uma pessoa no dia.
- Atalhos para a ficha do colaborador.

## 3. Versão Mobile
- Segue a **estrutura atual em linhas do Calendário de Folgas**: uma linha por dia do mês com dia da semana, contagem e nomes dos ausentes (respeitando os mesmos filtros, num botão "Filtros" que abre uma folha inferior).
- Tocar na linha abre a Visão do Dia em tela cheia, com os três blocos empilhados e recolhíveis.
- Ações (registrar ausência, extra, alterar setor) em botões grandes no rodapé e no toque longo/menu de cada pessoa.
- Celular deitado usa o layout de tablet, como no restante do sistema.

## 4. Menu e acesso
- Item **Calendário** no grupo Rotina (sidebar desktop e menu "Mais" no mobile).
- Mesmas permissões do Painel da Operação; gestor de unidade vê só suas unidades.
- Praianos e demais empresas não são afetadas além do item novo no menu.

## 5. Fora do escopo agora
- Remover ou mudar as telas antigas.
- Mudanças nas regras de folga, férias, convocação ou cobertura.
- Publicação.

## Detalhes técnicos
- Rota nova `/dp/rotina/calendario` em `App.tsx`; entrada em `src/config/dpNavigation.tsx` no grupo `rotina` (aparece em `DpRotinaHub`).
- Página `src/pages/dp/DpCalendarioRotina.tsx` + componentes em `src/components/dp/calendario/`: `CalendarioMes`, `CalendarioFiltros`, `CalendarioDiasLista` (mobile, baseado em `DiasEmLista`), `CalendarioDiaPainel`.
- Hook agregador `useDpCalendarioRotina(unidade, mês)` reutilizando as consultas existentes: folgas (`useDpFolgasQueries`, já com dias cedidos e origem troca), férias (gozos/marcadas), ocorrências (faltas/atestados), afastamentos, bloqueios/indisponibilidades, convocações, pessoas avulsas/apoio e escala publicada.
- Lógica pura em `src/lib/dp/calendario-rotina.ts`: classificar ausências por tipo, aplicar filtros, montar o dia por setor usando `setorEfetivoDoDia`/`resolverSetorPrevisto` e cobertura mínima (`montarOperacaoDia`).
- Ações reaproveitam os diálogos e RPCs da Operação (registrar ausência, extra) e `AlterarSetorDiaDialog`; nenhuma migração prevista. Filtros salvos em `dp_user_prefs`.
- Testes em `src/lib/dp/__tests__/calendario-rotina.test.ts`: filtro oculta só o tipo desmarcado; dia cedido em troca não aparece como folga; setor alterado no dia vence o habitual; convocação pendente vai para "aguardando aceite".
- Verificação no navegador (desktop e mobile) com a Pakerê na semana de 05/10/2026.

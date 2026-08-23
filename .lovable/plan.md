# Operação: renomear, reordenar cards e Folga Sócio

## 1. Renomear a tela para "Operação"
- Menu Rotina: item "Painel da Operação" passa a "Operação" (rota `/dp/escalas/mes` mantida, sem quebrar favoritos/menu salvo).
- Título e `<Helmet>` da tela passam a "Operação".

## 2. Cards reordenáveis (Rotina do Dia e Rotina do Mês)
- Cada aba ganha arrastar-e-soltar nos cards de indicadores, com o mesmo padrão de drag & drop já usado no menu do DP.
- A ordem é salva por usuário + empresa nas preferências do DP (`dp_user_prefs.extras`), separada por aba (`dia` e `mes`), com botão "Restaurar ordem padrão".
- Em telas pequenas o arraste continua funcionando por toque (handle visível no card).

## 3. Card "Folga Sócio" (substitui "Carga Prevista")
- Na Rotina do Dia, o card "Carga Prevista" é removido e entra "Folga Sócio":
  - valor = quantidade de sócios em folga ou férias naquele dia;
  - clique abre a lista com nome do sócio e se é folga ou férias;
  - tom neutro quando zero e destaque quando houver sócio ausente.
- A informação de carga prevista continua disponível no rodapé dos blocos por turno (não se perde).
- Na Rotina do Mês, o calendário passa a marcar com um ponto os dias com folga/férias de sócio.

## 4. Marcação de folga/férias do sócio pergunta sobre bloqueio
Quando um sócio marca folga (calendário do portal) ou o admin lança folga/férias de um sócio pelo calendário do DP, aparece um passo de confirmação:

- "Bloquear este dia (ou período) para os demais colaboradores?" — Sim / Não.
- Se sim e a empresa tiver mais de uma unidade: seleção de quais unidades recebem o bloqueio (uma, várias ou todas), já pré-marcando a unidade do sócio.
- Se a empresa tiver só uma unidade, o bloqueio é aplicado nela direto, sem pergunta extra.
- Para férias, o bloqueio cobre todos os dias do período.
- O motivo do bloqueio é gravado como "Folga/Férias do sócio <nome>", ficando visível na aba Regras > Datas Bloqueadas da tela Folgas, onde o admin pode remover ou liberar.
- Ao excluir a folga/férias do sócio, o sistema pergunta se os bloqueios gerados por ela também devem ser removidos.
- O comportamento de exceção continua igual: colaborador pode pedir folga em data bloqueada como solicitação de exceção, que o DP aprova ou recusa.

## 5. Uma unidade selecionada por padrão
- Ao abrir a Operação, o filtro já vem com uma unidade escolhida: a unidade ativa com maior número de colaboradores ativos.
- "Todas as unidades" continua disponível, mas passa a ser uma escolha explícita do usuário.
- A última unidade escolhida é lembrada por usuário/empresa nas preferências do DP; se ela não existir mais, volta para a de maior quadro.

## 6. Blocos por turno de funcionamento da loja, com cargos
- Na Rotina do Dia, os blocos deixam de ser os turnos cadastrados dos colaboradores e passam a ser os períodos de funcionamento da unidade naquele dia da semana (ex.: "Almoço 11:00 → 15:00", "Jantar 17:00 → 00:35").
- Cada colaborador previsto para o dia entra no período de funcionamento em que o horário dele se encaixa (sobreposição de horário). Quem trabalha em dois períodos aparece nos dois; quem não se encaixa em nenhum vai para um bloco "Fora do horário de funcionamento".
- Dentro de cada período, as pessoas são agrupadas por cargo, com contagem por cargo no topo do grupo (ex.: "Atendente (3)", "Pizzaiolo (1)").
- Cada linha mantém nome, horário previsto, regime/vínculo e a origem (convocação aceita, escala, habitual).
- Se a unidade estiver fechada no dia, o bloco mostra o aviso de unidade fechada e lista quem porventura estiver previsto.
- Com "Todas as unidades", os períodos são exibidos agrupados por unidade.

## Detalhes técnicos

- `src/config/dpNavigation.tsx`: rótulo do item.
- `src/pages/dp/DpOperacaoPanorama.tsx`: ordem persistida dos cards, novo card Folga Sócio, dialog de detalhe por sócio, marcador no calendário.
- `src/hooks/useDpOperacaoPanorama.tsx` + `src/lib/dp/operacao-panorama.ts`: incluir `vinculo_label` na consulta de colaboradores e derivar, por dia, a lista de sócios em folga/férias usando `isSocio` de `contrato-policy.ts`.
- Ordem dos cards em `dp_user_prefs.extras` (chave nova `operacao_cards`), seguindo o padrão de `menu_layout`.
- Novo componente `SocioBloqueioDialog` (folga/férias do sócio → bloqueio), usado em `DpAdminCalendario.tsx` e `src/pages/dp/portal/DpMeuCalendario.tsx`; grava linhas em `dp_datas_bloqueadas` (uma por data × unidade, `unidade_id` nulo quando o admin escolher "todas as unidades" como bloqueio global) com `motivo` identificando o sócio.
- Sem mudança de schema: `dp_datas_bloqueadas` já tem `data`, `unidade_id`, `motivo`, `liberada` e `liberada_por_solicitacao`.

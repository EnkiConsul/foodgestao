# Corrigir contagem de pendências, férias de desligados e alerta do Erildson

## 1. Pendências: 23 no cartão de cima, 22 na lista

Causa confirmada: os dois lugares contam de formas diferentes. A lista já desconsidera as pendências que foram **ignoradas** e as **adiadas** registradas no banco; o cartão "Pendências abertas" só desconsidera os adiamentos salvos nas preferências do usuário. A diferença de 1 é uma pendência ignorada que continua sendo contada em cima.

Correção: o cartão passa a usar exatamente a mesma regra da lista (ignoradas + adiadas), lendo as mesmas decisões. Assim os dois números sempre batem.

## 2. Férias mostrando a Cristiane, que foi desligada

Causa confirmada: a Cristiane está inativa, com desligamento em 27/08/2026, e ainda tem 10 períodos de férias cadastrados. A consulta de férias não olha se a pessoa está ativa, então ela entra nos indicadores e nas listas — inclusive no "Férias vencendo: 10" da tela inicial, que é praticamente só ela.

Correção:
- Férias passa a considerar apenas pessoas ativas nos indicadores, nas listas de planejamento e no cartão da tela inicial.
- Quem foi desligado sai da cobrança de prazo (vencido, risco de dobra, marcação atrasada) — férias em aberto de desligado são assunto da rescisão, não de programação.
- O histórico continua acessível: um filtro "Incluir desligados" na tela de Férias permite ver esses registros quando necessário, marcados como "Desligado".

## 3. Erildson sem alerta de risco/vencimento

Situação real dele: admitido em 01/10/2024, período 01/10/2024–30/09/2025 com 30 dias de saldo e prazo legal em 30/09/2026 — hoje faltam 19 dias, com 30 dias a gozar. Pela regra já implementada isso é "Marcação atrasada" (vermelho), e ele deveria aparecer também no total "Vencem em até 30 dias".

Não está confirmado por que a tela não mostra isso, então o primeiro passo é reproduzir a tela de Férias e as Pendências com os dados dele e identificar onde o alerta se perde (ordem/filtro da lista, período em aquisição interferindo no cálculo de acúmulo, ou a apuração das pendências ainda com dado antigo). Só depois aplicar a correção no ponto exato encontrado, sem mexer nas datas ou saldos cadastrados.

Ao final, recalcular as pendências da empresa para que o alerta apareça na hora.

## Detalhes técnicos

- `src/components/dp/home/KpiCards.tsx`: usar `useDpPendenciasDecisoes` e a mesma composição `filtrarAbertas(data.filter(!ignoradas), {...prefs.pendencias_adiadas, ...adiadas})` do `PendenciasCard`; extrair esse cálculo para um helper compartilhado (ou hook) para evitar nova divergência.
- `src/hooks/useDpFerias.tsx`: incluir `ativo` e `data_desligamento` no select de `dp_colaboradores` e expor `ativo`/`desligado` no `FeriasPeriodo`; filtro opcional `incluirDesligados` (padrão falso).
- `src/lib/dp/ferias-direito.ts`: `nivelVencimentoPeriodo` recebe `desligado` e retorna `normal` (mesma porta de saída do `socio`); `periodosComAcumulo` e `riscoAcumuloPorColaborador` ignoram desligados.
- `src/components/dp/ferias/FeriasDashboard.tsx`, `src/pages/dp/DpFerias.tsx`, `src/components/dp/ferias/FeriasGozosPanel.tsx`: filtrar desligados dos KPIs/listas, tag "Desligado" e chave do filtro na URL.
- `src/hooks/useDpPendencias.tsx` e `private.dp_refresh_document_pending`: conferir se o bloco de férias já exclui desligados; alinhar server-side se necessário.
- Investigação do item 3 com Playwright em `/dp/ferias` e `/dp/cadastros/pendencias` filtrando pelo Erildson, antes de qualquer alteração de lógica.
- Testes em `src/lib/dp/__tests__/ferias-direito.test.ts` (desligado nunca vencido/em risco; caso do Erildson: 19 dias de prazo com 30 de saldo → marcação atrasada) e um teste da paridade de contagem entre `KpiCards` e `PendenciasCard`.

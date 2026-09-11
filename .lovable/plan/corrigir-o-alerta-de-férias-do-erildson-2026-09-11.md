# Corrigir o alerta de férias do Erildson

## Diagnóstico confirmado
- Erildson foi admitido em **01/10/2024** e está ativo como intermitente.
- O período aquisitivo **01/10/2024 a 30/09/2025** existe, está aberto e possui **30 dias de saldo**.
- O prazo legal para concessão termina em **30/09/2026**. Portanto, em 11/09/2026 ele ainda não está legalmente vencido, mas está em situação crítica, próximo do risco de pagamento em dobro.
- A empresa está configurada para classificar ciclos encerrados como **A conceder**.
- A tela de férias respeita essa configuração, mas as pendências da tela inicial usam outra classificação e apresentam esse período apenas como “Férias a vencer”. Essa divergência reduz a urgência do alerta.

## Implementação
- Unificar a classificação das pendências da tela inicial com a regra já usada na tela de férias.
- Para o Erildson e casos equivalentes, exibir **Férias a conceder — risco de dobra** enquanto houver saldo e o prazo legal estiver próximo.
- Informar no texto a data limite legal e quantos dias faltam, deixando claro quando o risco se torna efetivo.
- Após 30/09/2026, mudar automaticamente a classificação para **Férias vencidas — pagamento em dobro**.
- Preservar as exclusões existentes para sócios, períodos concluídos e férias controladas externamente.
- Manter a ordenação das férias mais urgentes primeiro na tela inicial e na lista completa de pendências.

## Atualização e validação
- Invalidar e recalcular as pendências da empresa após a correção para que o alerta do Erildson apareça imediatamente, sem aguardar a rotina das 03h.
- Adicionar testes para período adquirido longe do prazo, próximo do prazo legal, no último dia e após o vencimento.
- Conferir o mesmo resultado na tela inicial, na lista de pendências e na tela de férias.

## Detalhes técnicos
Usar `nivelVencimentoPeriodo` como fonte única da classificação e complementar a regra compartilhada com um estado explícito de risco de dobra por proximidade do limite concessivo. O ajuste será aplicado à montagem das pendências em `useDpPendencias`, sem alterar datas, saldos ou períodos cadastrados.

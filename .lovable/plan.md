# Corrigir o card de Pendências vazio ao abrir

## Objetivo
Manter a última lista conhecida visível desde a abertura da tela e trocá-la somente quando a nova apuração estiver realmente concluída.

## Alterações
- Ajustar o estado do card para recuperar o retrato da empresa também quando a empresa selecionada chega depois da primeira renderização.
- Não aceitar uma lista vazia ou parcial como substituta do retrato anterior enquanto a apuração estiver carregando ou sem uma data de conclusão nova confirmada.
- Manter totais, grupos e horário anteriores durante toda a atualização; somente a seta continuará girando.
- Preservar o retrato anterior se a atualização falhar, em vez de limpar o card.
- Gravar o novo retrato somente após a conclusão confirmada da apuração.

## Validação
- Cobrir abertura com empresa ainda não carregada, recarregamento da página, resposta vazia intermediária, atualização concluída e falha de atualização.
- Validar no celular que o card abre preenchido e faz a troca de dados de uma vez, sem piscar vazio ou exibir “Carregando…” quando já existe histórico.

## Limite
“Carregando…” continuará aparecendo apenas quando aquela empresa realmente nunca teve uma apuração concluída disponível nesse navegador.

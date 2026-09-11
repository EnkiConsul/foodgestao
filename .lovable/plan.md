# Atualização diária das pendências

## Objetivo
Alterar somente a frequência automática das pendências: uma execução diária às 03:00, no horário de São Paulo.

## Alterações
- Substituir o agendamento atual das 06:00, 14:00 e 22:00 por um único processamento diário às 03:00.
- Ajustar o nome do agendamento para refletir o novo horário e evitar manter duas rotinas ativas.
- Retirar a repetição automática da tela a cada 8 horas, alinhando a consulta periódica ao ciclo diário.
- Preservar as atualizações já existentes quando o gestor conclui uma ação, usa o botão **Atualizar** ou quando uma alteração relevante marca as pendências para recálculo.
- Atualizar os textos internos e o roteiro do projeto sem modificar regras de elegibilidade, prazos, ordenação, ignorar ou adiar.

## Validação
- Confirmar que existe somente um agendamento ativo, às 03:00 de São Paulo.
- Validar que o botão **Atualizar** continua funcionando e que as ações concluídas continuam refletindo nas telas.
- Executar os testes das regras de pendências e a verificação de tipos.

## Detalhes técnicos
O processamento diário continuará sendo transacional e idempotente no banco. Às 03:00 de São Paulo corresponde a 06:00 UTC no horário atual; o agendamento será configurado para esse instante, sem alterar o cálculo existente.

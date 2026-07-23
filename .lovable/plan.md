## Objetivo
Reinserir as credenciais da Z-API para validar se o erro `403 Client-Token not allowed` é causado por token incorreto/expirado.

## Passos

1. **Reabrir o formulário seguro de secrets** para os 3 valores da Z-API:
   - `Z_API_INSTANCE_ID` — ID da instância (dashboard Z-API → sua instância)
   - `Z_API_INSTANCE_TOKEN` — Token da instância (mesma tela, campo "Token")
   - `Z_API_CLIENT_TOKEN` — Account Security Token (Menu **Conta de Segurança** no painel Z-API; **não** é o token da instância)

   Observação: a causa mais comum do `403 Client-Token not allowed` é confundir o **Client-Token (Account Security Token)** com o token da instância. Confirme no painel qual valor pertence a cada campo antes de colar.

2. **Após salvar**, disparar um teste controlado:
   - Chamar `checkZapiStatus()` via `/esqueci-senha` com um CPF válido.
   - Conferir em `auth_recovery_challenges.whatsapp_delivery_status` se o valor deixa de ser `failed_http_403` e passa a `sent` (ou outro código).

3. **Se ainda falhar com 403**: sinal de que o Client-Token no painel Z-API está desativado ou foi rotacionado — orientar regeneração no painel e nova atualização do secret.

## Nada de código muda
Nenhum arquivo do projeto será alterado — apenas os valores dos secrets no ambiente. A telemetria já implementada na última rodada é suficiente para diagnosticar o resultado.

Confirma que quer que eu abra o formulário para você recolar os três valores?
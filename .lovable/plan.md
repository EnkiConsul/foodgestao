## Diagnóstico confirmado

- O backend está conseguindo encontrar o usuário em tentativas recentes: há registros `pending_otp` com `user_id` preenchido.
- Também há telefone cadastrado para esse usuário: o cadastro tem telefone em `profiles.phone` e o formato bruto possui 11 dígitos, compatível com celular brasileiro com DDD.
- Portanto, para as tentativas recentes, o problema não parece ser ausência de telefone nem formato inválido no cadastro.
- O registro fica com `otp_sent_at` preenchido, mas sem `whatsapp_message_id` e sem `whatsapp_delivery_status = sent`, indicando que o sistema tentou enviar, mas a Z-API não confirmou o disparo.
- Os logs recentes da função mostram rejeição da Z-API com `403 Client-Token ... not allowed`, o que aponta para credencial/header/instância Z-API não autorizada, não para busca de telefone.

## Plano de correção

1. **Melhorar a observabilidade sem vazar dados sensíveis**
   - Registrar nos logs apenas: se encontrou usuário, se encontrou telefone, origem do telefone (`profiles.phone`, `dp_colaboradores.whatsapp` ou `dp_colaboradores.telefone`), quantidade de dígitos e status HTTP da Z-API.
   - Não logar CPF, e-mail, telefone completo, OTP, token ou Client-Token.

2. **Persistir falha técnica de envio no lote de recuperação**
   - Quando a Z-API retornar erro, atualizar `auth_recovery_challenges.whatsapp_delivery_status` com códigos seguros como `failed_http_403`, `failed_network_error`, `failed_not_configured`.
   - Assim o histórico deixa claro se foi telefone ausente/formato inválido ou erro de integração.

3. **Validar status da instância antes do envio**
   - Chamar `checkZapiStatus()` antes de `sendZapiText()`.
   - Se a instância estiver desconectada ou rejeitando credenciais, gravar status seguro e não tentar múltiplos envios desnecessários.

4. **Aprimorar fallback de telefone**
   - Manter a ordem atual `profiles.phone -> dp_colaboradores.whatsapp -> dp_colaboradores.telefone`.
   - Registrar apenas a origem usada e o resultado da normalização.
   - Se nenhum número normalizar, manter resposta genérica para o usuário, mas gravar `no_valid_phone` internamente.

5. **Ajustar retorno interno sem quebrar segurança**
   - A tela continuará sem revelar se o identificador existe ou qual telefone foi usado.
   - Para administradores/debug, a diferença ficará nos logs e no campo `whatsapp_delivery_status`.

## O que provavelmente precisa ser corrigido fora do código

- Revisar o segredo/configuração `Z_API_CLIENT_TOKEN` no backend, porque o erro atual da Z-API é `403 Client-Token not allowed`.
- Confirmar que o `Client-Token` pertence à mesma conta/instância dos valores `Z_API_INSTANCE_ID` e `Z_API_TOKEN`.
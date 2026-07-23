## Reabrir formulário seguro para recolar os 3 secrets da Z-API

Vou abrir o formulário de update dos três secrets. Cole exatamente:

- **`Z_API_INSTANCE_ID`** → `3F68F94F94845025C4D5363AE9828EBD` (ID da instância)
- **`Z_API_INSTANCE_TOKEN`** → `8439B5409A75F83F042266B7` (Token da instância)
- **`Z_API_CLIENT_TOKEN`** → valor do menu **Conta de Segurança / Account Security Token** no painel Z-API (⚠️ **não** é o Token da instância)

Após salvar, teste `/esqueci-senha` e verifico o `whatsapp_delivery_status` para confirmar se saiu do `failed_http_403`.

Nenhum arquivo do projeto é alterado — apenas valores de secrets.
## Análise de conformidade — Integração Z-API (`supabase/functions/_shared/zapi.ts`)

### ✅ Itens em conformidade

| Diretriz Z-API | Implementação atual | Status |
|---|---|---|
| Base URL `https://api.z-api.io/instances/{instanceId}/token/{token}` | `https://api.z-api.io/instances/${instance}/token/${token}/send-text` | ✅ |
| `instanceId` via painel | Lido de `Z_API_INSTANCE_ID` (secret) | ✅ |
| `token` via painel | Lido de `Z_API_TOKEN` (secret) | ✅ |
| Header `Client-Token` obrigatório | Enviado a partir de `Z_API_CLIENT_TOKEN` | ✅ |
| Header `Content-Type: application/json` | Presente em todas as requisições | ✅ |
| Corpo em JSON | `JSON.stringify({ phone, message })` | ✅ |
| Método HTTP correto (POST em `send-text`) | `method: "POST"` | ✅ |
| Tratamento do código 200 | `resp.ok` → retorna `messageId` | ✅ |
| Tratamento de 400/405/415 | Cai no branch `!resp.ok` com log do status e erro | ✅ |
| Segurança dos segredos | Nunca hardcoded, sempre em `Deno.env` | ✅ |
| Privacidade | Não loga corpo da mensagem nem telefone completo | ✅ |

### ⚠️ Pontos de atenção (não bloqueantes)

1. **Ausência de retry/backoff** em falhas transitórias (`5xx`, `network_error`). A Z-API pode responder com timeouts quando a instância está reiniciando — hoje o OTP simplesmente falha.
2. **Não há verificação de status da instância** antes do envio. A Z-API oferece `GET /status` que retornaria se o WhatsApp está `connected`. Sem isso, um device desconectado gera falha silenciosa vista só no log.
3. **Normalização de telefone permissiva demais**: a regra `if (d.length >= 11 && d.length <= 15) return d;` aceita números 11 dígitos sem `55` como internacionais (ex.: `11987654321` seria retornado sem country code). Deveria priorizar prefixo `55` para números BR.
4. **Header `Content-Type` não é validado na resposta** — se a Z-API retornar HTML (ex.: manutenção), o `JSON.parse` falha silenciosamente e cai no branch de erro sem detalhe. Já é tratado com `try/catch`, mas o log poderia distinguir.
5. **Falta suporte a `messageId` para tracking de entrega** — hoje o valor é capturado mas não persistido em `auth_recovery_challenges` para auditoria de entrega/leitura via webhook Z-API.

### 📋 Sugestões de melhoria (opcional, se aprovar)

- Adicionar função `checkZapiStatus()` que consulta `GET /status` e retorna se a instância está conectada. Chamar antes de enviar OTP e devolver erro claro (`zapi_disconnected`) se offline.
- Implementar retry com backoff (2 tentativas, 500ms/1500ms) para erros `5xx` e `network_error`.
- Corrigir `normalizeBRPhone`: se telefone tem 11 dígitos e começa com DDD válido (11–99), prepender `55` sempre.
- Persistir `messageId` retornado em `auth_recovery_challenges.zapi_message_id` para correlacionar com webhooks de entrega.
- Registrar um webhook em `/functions/v1/zapi-webhook` para receber status de entrega (`delivered`, `read`, `failed`) e atualizar telemetria.

### Conclusão

**A integração está em conformidade com as diretrizes básicas da API da Z-API** (base URL, autenticação por `Client-Token`, `Content-Type`, método HTTP e formato JSON). As oportunidades identificadas são de **robustez operacional**, não de conformidade.

---

**Deseja que eu prossiga aplicando as melhorias listadas?** Posso executar em três frentes independentes:
1. **Robustez (retry + status check)** — evita falhas silenciosas quando a instância está reiniciando.
2. **Correção da normalização BR** — garante que números de 11 dígitos ganhem `55` sempre.
3. **Rastreamento de entrega (webhook + coluna `zapi_message_id`)** — auditoria de entrega/leitura do OTP.

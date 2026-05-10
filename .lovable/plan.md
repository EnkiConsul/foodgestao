## Objetivo

Substituir o checkout fictício atual por uma integração real com o **Asaas (Sandbox)** para cobrar as assinaturas dos planos do Gestor Plin, usando uma única conta Asaas (a do dono do SaaS). Suporte a **PIX, Boleto e Cartão de Crédito**, com confirmação automática via **webhook**.

## Estado atual

- `plans`, `subscriptions`, `invoices`, `coupons` já existem com RLS.
- `subscriptions` tem `external_subscription_id` e `external_customer_id`. `invoices` tem `external_invoice_id`, `external_payment_url`, `pix_qrcode`, `boleto_url`. Ou seja, o schema já está pronto para receber IDs externos.
- `src/pages/Checkout.tsx` hoje só cria linhas no banco — não fala com nenhum gateway.
- Existe `profiles` (com nome do usuário) e `companies` (com CPF/CNPJ em alguns perfis), úteis para criar o `customer` no Asaas.

## Como funciona o Asaas (resumo)

- API REST: `https://sandbox.asaas.com/api/v3` (sandbox) e `https://www.asaas.com/api/v3` (produção). Header de auth: `access_token: <API_KEY>`.
- Fluxo: criar **Customer** → criar **Payment** (PIX / BOLETO / CREDIT_CARD) ou **Subscription** (recorrência) → receber **Webhook** quando o status muda (`PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, etc.).
- Webhook é configurado na conta Asaas apontando para a URL pública da Edge Function. O Asaas envia um header `asaas-access-token` com um valor que **nós definimos** no painel — é assim que validamos a origem.

## Arquitetura proposta

```text
Frontend (Checkout.tsx)
   │  1. POST → edge fn "asaas-create-checkout" { planId, method, couponCode }
   ▼
Edge Function (server)
   │  • valida JWT do usuário (verify_jwt)
   │  • valida plano + cupom no banco
   │  • cria/recupera Customer no Asaas
   │  • cria Subscription (recorrente) ou Payment único no Asaas
   │  • grava subscriptions (status="pending") + invoices (status="open")
   │      com external_*_id, pix_qrcode, boleto_url, external_payment_url
   ▼
Asaas
   │  ... cliente paga ...
   ▼
Edge Function "asaas-webhook"
   • valida header asaas-access-token
   • marca invoice como paid e subscription como active
   • registra evento em audit_logs
```

## Mudanças

### 1. Segredos (Lovable Cloud)

Adicionar via `add_secret`:
- `ASAAS_API_KEY` — chave de API do Sandbox (depois trocada para produção).
- `ASAAS_API_URL` — `https://sandbox.asaas.com/api/v3` (configurável; permite trocar para produção depois).
- `ASAAS_WEBHOOK_TOKEN` — token aleatório que cadastraremos no painel do Asaas e validaremos a cada webhook recebido.

### 2. Banco de dados (migração)

- Em `profiles`: adicionar `asaas_customer_id text` (cache do customer do dono daquela `user_id` no Asaas, evita recriar).
- Em `invoices`: adicionar `asaas_payment_id text` (caso queiramos guardar separado de `external_invoice_id`, opcional — pode reaproveitar `external_invoice_id`).
- Tabela nova `asaas_webhook_events` para idempotência:
  - `id uuid pk`, `event_id text unique`, `event_type text`, `payload jsonb`, `processed_at timestamptz`, `created_at timestamptz`.
  - RLS: somente `super_admin` lê; insert é feito pela edge function com service role.

### 3. Edge Functions

Criar em `supabase/functions/`:

- **`asaas-create-checkout/index.ts`** (`verify_jwt = true`)
  - Body: `{ planId: uuid, paymentMethod: "PIX"|"BOLETO"|"CREDIT_CARD", couponCode?: string, holder?: { name, cpfCnpj, postalCode, addressNumber, phone, creditCard?, creditCardHolderInfo? } }`.
  - Valida com Zod, busca plano, valida cupom, calcula valor.
  - Garante customer no Asaas (`GET /customers?cpfCnpj=` ou `POST /customers`), salva `asaas_customer_id` no `profiles`.
  - Se plano recorrente (não anual à vista): chama `POST /subscriptions` (`cycle: MONTHLY|YEARLY`, `value`, `billingType`, `nextDueDate`).
  - Se cobrança única: `POST /payments`.
  - Cria a `subscriptions` local (status `pending`) + `invoices` local com `external_invoice_id`, `external_payment_url`, `pix_qrcode` (chama `GET /payments/{id}/pixQrCode` quando PIX) e `boleto_url` (`bankSlipUrl`).
  - Retorna ao frontend: `{ invoiceId, paymentUrl, pixQrCode, pixCopyPaste, boletoUrl, dueDate, amount }`.

- **`asaas-webhook/index.ts`** (`verify_jwt = false`, público)
  - Lê header `asaas-access-token`; rejeita se diferente de `ASAAS_WEBHOOK_TOKEN`.
  - Insere o evento em `asaas_webhook_events` (ON CONFLICT DO NOTHING) — garante idempotência.
  - Mapeia `event` → status local:
    - `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → `invoices.status='paid'`, `paid_at=now()`, `subscriptions.status='active'`.
    - `PAYMENT_OVERDUE` → `invoices.status='overdue'`, `subscriptions.status='past_due'`.
    - `PAYMENT_REFUNDED` → `invoices.status='refunded'`.
    - `SUBSCRIPTION_DELETED` → `subscriptions.status='canceled'`.
  - Registra em `audit_logs`.

- **`asaas-cancel-subscription/index.ts`** (`verify_jwt = true`)
  - Cancela no Asaas (`DELETE /subscriptions/{id}`) e atualiza local.

Cada função usa um helper `_shared/asaas.ts` (fetch + headers + tratamento de erro). CORS conforme padrão Lovable.

### 4. Frontend

- **`src/pages/Checkout.tsx`**: substituir a mutation atual por chamada a `supabase.functions.invoke('asaas-create-checkout', ...)`. Após sucesso, redirecionar para nova página `/checkout/:planSlug/pagamento/:invoiceId` que mostra:
  - PIX: QR Code (imagem), código copia-e-cola, botão "Já paguei → atualizar status".
  - Boleto: botão para abrir `bankSlipUrl`, linha digitável.
  - Cartão: formulário coletando dados do cartão antes de chamar a edge function (Asaas aceita tokenização ou os campos do cartão direto via API; para simplificar no MVP, enviar campos via HTTPS na chamada da edge function — destacar no plano que a opção mais segura para produção é tokenizar via JS do Asaas).
- Polling leve (a cada 5s, máx. 2 min) consultando `invoices.status` para sair da tela quando confirmado, além do webhook.
- Página `/configuracoes` ou `/planos`: botão "Cancelar assinatura" → invoca `asaas-cancel-subscription`.

### 5. Backoffice (super admin)

- Em `/admin/assinaturas` e `/admin/faturas`, mostrar `external_*_id` com link para o painel do Asaas e botão "Sincronizar com Asaas" (busca status atual via `GET /payments/{id}` e atualiza local).

### 6. Configuração no painel Asaas (passo manual do usuário)

Documentar para o usuário:
1. Em Sandbox, gerar API Key e colocar em `ASAAS_API_KEY`.
2. Cadastrar Webhook em **Integrações → Webhooks**:
   - URL: `https://<project-ref>.functions.supabase.co/asaas-webhook`
   - Email para falhas
   - Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
   - Eventos: todos os `PAYMENT_*` e `SUBSCRIPTION_*`.

## Detalhes técnicos

- API Asaas: REST simples, sem SDK oficial em Deno — usar `fetch` com header `access_token`, `Content-Type: application/json` e User-Agent. Tratar `errors: [{description}]` da resposta.
- Conversão de centavos: Asaas trabalha em reais (`value: 49.90`). Converter a partir de `price_cents`.
- Idempotência: usar `event.id` do payload como chave em `asaas_webhook_events`.
- Logs: `console.log/error` em cada função, visíveis em Cloud → Functions → Logs.
- Não armazenar dados de cartão no nosso banco — apenas IDs do Asaas.

## Riscos / pontos abertos

- **Cartão de crédito**: para passar pelo PCI sem complicação, recomendado usar tokenização via Asaas Checkout (link hospedado) na primeira versão. Posso implementar usando `POST /payments` com `billingType: UNDEFINED` + `invoiceUrl` do Asaas (página de pagamento hospedada deles), evitando coletar cartão no nosso frontend. **Sugestão**: começar assim no MVP.
- Trocar para produção: basta atualizar `ASAAS_API_KEY` e `ASAAS_API_URL`. Webhook precisa ser recadastrado no painel de produção.

## Arquivos afetados

- Novos: `supabase/functions/asaas-create-checkout/index.ts`, `asaas-webhook/index.ts`, `asaas-cancel-subscription/index.ts`, `_shared/asaas.ts`.
- Editar: `src/pages/Checkout.tsx`, novo `src/pages/CheckoutPagamento.tsx` (tela de PIX/boleto/cartão), `src/App.tsx` (rota), `src/components/admin/AdminSubscriptions.tsx` e `AdminInvoices.tsx` (botões sync).
- Migração: alteração em `profiles`, criação de `asaas_webhook_events`.
- Segredos: `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN`.

## Próximo passo (após aprovação)

1. Solicitar os três segredos via `add_secret` (você cola a chave do Sandbox + define um token aleatório para o webhook).
2. Rodar a migração.
3. Implementar as edge functions e o novo fluxo de checkout.
4. Te passar a URL exata do webhook para cadastrar no painel do Asaas.

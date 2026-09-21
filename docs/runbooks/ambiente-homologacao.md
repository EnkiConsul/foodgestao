# Runbook — build de homologação (banco exclusivo)

Banco exclusivo de homologação: **`utjhzpdbqzajrhnzcher`**
Endpoint exato exigido: **`https://utjhzpdbqzajrhnzcher.supabase.co`**
Produção (`grtxmbffgmgnkawlvqhm`) permanece intocada: `.env`, `supabase/config.toml`
e a conexão do Cloud não foram alterados.

## 1. Variáveis obrigatórias

Arquivo **`.env.homologacao`** na raiz (modelo em `.env.homologacao.example`):

| Variável | Valor exigido |
|---|---|
| `VITE_APP_ENV` | `homologacao` (exato) |
| `VITE_SUPABASE_URL` | `https://utjhzpdbqzajrhnzcher.supabase.co` (exato) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publicável (anon) **do projeto de homologação** |
| `VITE_SUPABASE_PROJECT_ID` | `utjhzpdbqzajrhnzcher` (opcional; se presente precisa bater) |

A chave publicável é obtida no painel do projeto de homologação (Project Settings → API).
Não copie nenhuma chave de produção. O `service_role` nunca entra no frontend.

## 2. Comandos

```bash
npm run hom:check      # valida .env.homologacao (não imprime valores)
npm run dev:hom        # desenvolvimento apontando para homologação
npm run build:hom      # build de homologação (dist/)
npm run preview:hom    # serve o build gerado
```

Produção segue com `npm run dev` / `npm run build`, sem nenhuma mudança.

## 3. Garantias fail-closed

1. `src/bootstrap/ambiente.ts` é o **primeiro** módulo avaliado por `main.tsx`,
   antes de `src/integrations/supabase/client.ts` criar o cliente.
2. `resolverAmbiente` (`src/lib/env/appEnv.ts`) recusa e impede o app de subir quando:
   URL ausente/fora de padrão, chave publicável ausente/malformada, `project_id`
   divergente, flag inválida, flag de homologação com banco de produção,
   banco de homologação **sem** a flag, ou banco desconhecido. Não há fallback.
3. Tarja permanente "Ambiente de homologação" (`AmbienteBanner`), invisível em produção.
4. Em homologação, `supabase.functions.invoke` é interceptado uma única vez
   (`src/lib/env/homologacaoRuntime.ts`):
   - **Simulado sem rede:** `lookup-cnpj` → fixture determinística fictícia.
   - **Bloqueado (erro imediato):** `asaas-*`, `pluggy-*`, `ai-*`,
     `inspect-search-console`, `dp-send-broadcast`, `admin-resend-confirmation`,
     `auth-recovery-request`, `auth-email-hook`, `sync-extra-companies`, `validate-coupon`.
   - **Liberado:** funções próprias da plataforma (`check-onboarding-cnpj`, `auth-login`,
     `accept-invite`, rotinas de Pessoas 360°), que só falam com o banco de homologação.
5. CEP (`consultarCep`) responde por fixture em homologação — ViaCEP não é chamado.
6. Produção não ganhou CNPJ mágico, parâmetro de URL nem qualquer bypass: os mocks
   só existem sob `isHomologacao()`, que exige o banco de homologação.

## 4. O que ainda falta para isolamento completo (bloqueios fora deste escopo)

Estes passos exigem credenciais/DDL no projeto de homologação e **não** foram executados,
conforme a restrição de não aplicar DDL nem alterar conexões:

1. Aplicar `supabase/migrations` no ref de homologação:
   `SUPABASE_DB_URL=<url do banco hom> npm run db:migrate` (ou `supabase db push --project-ref utjhzpdbqzajrhnzcher`).
   Sem isso o app sobe, mas as telas falham por tabelas ausentes.
2. Publicar as funções no ref de homologação:
   `supabase functions deploy --project-ref utjhzpdbqzajrhnzcher` (sem editar `supabase/config.toml`,
   que continua apontando para produção).
3. Definir segredos próprios nesse projeto — Asaas **sandbox**, Pluggy **sandbox**,
   e-mail em modo teste. Enquanto não existirem, o bloqueio do item 3.4 mantém o
   comportamento seguro (falha explícita em vez de chamada real).
4. Desligar/reagendar crons (`expire-trials` etc.) no projeto de homologação.
5. Semear usuários e empresas de teste: `scripts/seed-staging.mjs` é citado em
   `scripts/preflight-secrets.mjs` mas **não existe** — precisa ser criado com
   `STAGING_SUPABASE_URL`/`STAGING_SERVICE_ROLE_KEY` do projeto de homologação.
6. E2E (`npm run e2e`) continuam mirando `http://localhost:8080`; rode-os apenas com
   `npm run dev:hom` ativo, ou contra o `preview:hom`.

Nenhuma URL hospedada foi inventada e nenhum projeto pago foi criado.

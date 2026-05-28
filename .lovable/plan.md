## Conformidade LGPD/Brasil — Gestor Plin

Implementação completa das exigências legais brasileiras para SaaS, com base no padrão LGPD (Lei 13.709/2018), Marco Civil da Internet (Lei 12.965/2014) e CDC.

### 1. Documentos legais (páginas públicas editáveis)

Estendo o sistema CMS já existente da Landing Page para também gerenciar os documentos legais.

Novas seções em `landing_content` (JSONB editável pelo super admin):
- `legal_privacy` — Política de Privacidade (LGPD)
- `legal_terms` — Termos de Uso
- `legal_cookies` — Política de Cookies
- `legal_dpo` — Encarregado de Dados (DPO) + canal de contato + direitos do titular

Novas rotas públicas:
- `/privacidade` → renderiza `legal_privacy`
- `/termos` → renderiza `legal_terms`
- `/cookies` → renderiza `legal_cookies`
- `/encarregado-dados` (alias `/dpo`) → renderiza `legal_dpo`

Cada página: layout limpo com `<Helmet>` (title/description/canonical), conteúdo em Markdown renderizado (via `react-markdown`), data de "última atualização", botão "Voltar".

Defaults em `src/lib/legal-defaults.ts` com textos-modelo prontos para SaaS BR (Gestor Plin como controlador, Asaas/Supabase como operadores, base legal por finalidade, prazo de retenção, direitos LGPD art. 18, canal do DPO usando e-mail editável).

### 2. Editor no Backoffice

Nova página `/admin/legal` (sidebar admin: "Documentos Legais") com abas: Privacidade, Termos, Cookies, DPO.

Cada aba:
- Campo `title`, `last_updated` (date), `body` (textarea grande Markdown), `dpo_email`/`dpo_name` quando aplicável
- Preview lado a lado opcional
- Botões "Salvar" e "Restaurar padrão" (mesmo padrão da Landing CMS)
- Log em `audit_logs` a cada salvar

Reaproveita `useLandingContent` (renomeio mental para "content CMS") ou cria hook irmão `useLegalContent`.

### 3. Banner de Consentimento de Cookies

Novo componente `src/components/legal/CookieConsentBanner.tsx`:
- Aparece somente para visitantes não autenticados que ainda não decidiram
- Persistência em `localStorage` (`plin_cookie_consent` = `{status: "accepted"|"rejected"|"custom", analytics: bool, marketing: bool, ts}`)
- 3 botões: "Aceitar todos", "Recusar não essenciais", "Personalizar"
- Modal "Personalizar" com switches por categoria (Necessários sempre ON; Analytics; Marketing)
- Link "Saiba mais" → `/cookies`
- Reabertura via link "Cookies" no footer (sempre acessível, requisito LGPD)
- Hook `useCookieConsent()` exposto para futuros scripts de analytics

Montado no `App.tsx` fora de rotas autenticadas (e também na Landing).

### 4. Aceite de Termos no Cadastro

Em `src/pages/Auth.tsx` (modo signup):
- Novo checkbox obrigatório: "Li e aceito a [Política de Privacidade](/privacidade) e os [Termos de Uso](/termos)"
- Validação no schema Zod: `acceptTerms: z.literal(true, { errorMap: () => ({ message: "Aceite obrigatório" }) })`
- Bloqueia o submit se não aceito
- Ao criar conta com sucesso, registra em nova tabela `legal_acceptances` o snapshot do aceite

### 5. Banco — Tabela de aceites

```sql
CREATE TABLE public.legal_acceptances (
  id uuid PK,
  user_id uuid NOT NULL,
  document_type text NOT NULL,  -- 'privacy' | 'terms' | 'cookies'
  document_version text,         -- last_updated do documento aceito
  accepted_at timestamptz default now(),
  ip_address text,
  user_agent text
);
```
- GRANTs: authenticated SELECT/INSERT próprios, service_role ALL
- RLS: usuário lê apenas seus aceites; super_admin lê todos
- Sem UPDATE/DELETE (registro imutável para prova legal)

### 6. Direitos do Titular — Configurações do Usuário

Em `src/pages/Configuracoes.tsx`, nova seção "Privacidade e Dados (LGPD)":

**Exportar meus dados (Portabilidade — art. 18 V)**
- Card `ExportMyDataCard`
- Botão "Baixar meus dados (JSON)"
- Edge function `export-user-data`: roda com service_role, agrega dados do usuário (profiles, companies onde é owner, accounts, transactions, contacts, categories, budgets, payment_methods, attachments meta, subscriptions, invoices, audit_logs), devolve JSON com timestamp
- Frontend faz download como `gestor-plin-meus-dados-YYYYMMDD.json`

**Excluir minha conta (Eliminação — art. 18 VI)**
- Card `DeleteMyAccountCard`
- Dialog de confirmação dupla: digitar "EXCLUIR" + senha atual
- Edge function `delete-user-account`: revalida senha, executa exclusão em cascata (mantém dados financeiros com `user_id` anonimizado se houver vínculo legal — ex: cobranças Asaas; demais dados são deletados; `auth.users` removido por último)
- Logout automático + redirect para `/`
- Log especial em `audit_logs`

### 7. Footer público (Landing + páginas legais)

Adiciono links no footer da Landing (e nas próprias páginas legais):
- Política de Privacidade
- Termos de Uso
- Política de Cookies
- Gerenciar Cookies (reabre banner)
- Encarregado de Dados

Esses links também ficam editáveis via CMS (extensão de `footer` em `LANDING_DEFAULTS`).

### 8. Aspectos técnicos

- Markdown: `bun add react-markdown remark-gfm`
- IP do cliente capturado por edge function (header `x-forwarded-for`), não pelo browser
- Senha confirmada na exclusão via `supabase.auth.signInWithPassword` em edge function
- Sem MFA bypass: usuários com MFA precisam estar autenticados normalmente para acessar Configurações
- Páginas legais públicas (sem auth) com SEO completo (Helmet)

### 9. Estrutura de arquivos

```text
src/
  pages/
    legal/
      Privacidade.tsx
      Termos.tsx
      Cookies.tsx
      EncarregadoDados.tsx
    admin/
      DocumentosLegais.tsx
  components/
    legal/
      CookieConsentBanner.tsx
      LegalDocumentView.tsx
    settings/
      ExportMyDataCard.tsx
      DeleteMyAccountCard.tsx
  hooks/
    useCookieConsent.tsx
    useLegalContent.tsx        (ou estender useLandingContent)
  lib/
    legal-defaults.ts
supabase/
  migrations/<ts>_legal_compliance.sql
  functions/
    export-user-data/index.ts
    delete-user-account/index.ts
```

### 10. Itens fora do escopo (informativo)

- Registro formal do DPO na ANPD (ação administrativa do cliente, não do código)
- RIPD (Relatório de Impacto) — documento jurídico externo
- Contratos de operador com Supabase/Asaas — externos

Pronto para implementar quando aprovado.
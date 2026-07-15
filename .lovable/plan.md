
# Reposicionamento 360°FOOD para Bares e Restaurantes

Substituir o onboarding atual (PF/MEI/Micro/Híbrido) por um **wizard de 2 etapas exclusivo para food service**, com identidade visual restrita à paleta da marca (laranja `#EB6119`, marinho `#0F1B3D`, branco). Adaptamos o prompt ao schema existente (`companies`, `company_members`, `company_modules`) para não quebrar nenhum módulo em produção. Contexto **Pessoal** deixa de ser exposto no cadastro e passa a ser um sub-modo interno "Financeiro Pessoal" que uma empresa pode ativar depois.

---

## 1. Banco de dados (1 migration única)

Adaptamos o modelo do prompt à estrutura já existente. Não criamos tabelas duplicadas em português.

### 1.1 `companies` — colunas novas
- `segmento_id uuid null references public.segmentos(id)` — obrigatório para novos cadastros PJ, validado na RPC.
- `whatsapp text`, `cep text`, `logradouro text`, `numero text`, `complemento text`, `bairro text`, `cidade text`, `uf char(2)` — endereço estruturado (mantém `address` legado como fallback/legado até migração futura).
- `trial_iniciado_em timestamptz`, `trial_termina_em timestamptz`, `status_tenant text default 'trial' check in ('trial','ativa','trial_expirado','suspensa','cancelada')`.
- Índice único parcial em `cnpj` para `profile_type='empresarial' AND cnpj IS NOT NULL` (não conflita com PF antigo).

### 1.2 `company_modules` — colunas novas
- `trial_iniciado_em timestamptz`, `trial_termina_em timestamptz`, `contratado_em timestamptz`, `cancelado_em timestamptz`, `valor_mensal numeric(10,2)`.
- Novo valor no enum `module`: `'financeiro_pessoal'` (sub-modo Financeiro para uso pessoal do dono; contratável pela empresa).
- Novo valor no enum `module_status`: `'trial_expirado'`.
- Novo valor no enum `module`: `'bi'` (BI 360°). Já existem `financeiro`, `dp`, `crm`, `pedidos`, `rh`.

### 1.3 Novas tabelas de catálogo
- `public.segmentos (id, nome, slug unique, ativo bool, ordem int)` — seed com os 12 segmentos food service do prompt.
- `public.modulos_catalogo (id, slug unique, nome, descricao_curta, icone, ordem, ativo)` — seed com 7 registros: Financeiro 360°, Financeiro Pessoal, DP 360°, CRM 360°, Pedidos 360°, RH 360°, BI 360°. Usado pelo grid da etapa 2 e por futuras telas admin. Não substitui o enum `module` — só adiciona metadados apresentáveis.
- Ambas com `GRANT SELECT` para `authenticated` + `anon` (catálogo público) e `GRANT ALL` para `service_role`. RLS habilitado com policy `select true`.

### 1.4 RPC atômica `fn_cadastrar_empresa_onboarding`
`security definer`, `search_path = public`. Assinatura recebe todos os campos do wizard + `p_modulos_slugs text[]`. Faz em uma transação:
1. Valida `auth.uid()`, `array_length(p_modulos_slugs) >= 1`, e `NOT EXISTS(cnpj)` — levanta exceções nomeadas (`usuario_nao_autenticado`, `nenhum_modulo_selecionado`, `empresa_ja_cadastrada`).
2. Faz upsert em `public.profiles` com nome/telefone/whatsapp do responsável.
3. Insere `public.companies` com `profile_type='empresarial'`, `status_tenant='trial'`, `trial_termina_em = now() + interval '14 days'`.
4. Insere `public.company_members` (`role='admin'`, `permissions` default full).
5. Para cada slug em `p_modulos_slugs`, insere `public.company_modules` com `status='trial'`, `trial_iniciado_em=now()`, `trial_termina_em=trial_fim`.
6. Chama `insert_audit_log` (`company_created`).
7. Retorna `jsonb { company_id, trial_termina_em }`.

RLS não muda — `companies`/`company_members`/`company_modules` já têm policies corretas hoje.

---

## 2. Frontend — Onboarding Wizard

Reescrita completa de `src/pages/Onboarding.tsx`. Removemos os componentes de perfil PF/MEI/Híbrido; o novo wizard tem 2 passos + tela de sucesso.

### 2.1 Estrutura
- `src/pages/Onboarding.tsx` — controlador do wizard, estado `react-hook-form` + Zod, stepper 1→2→sucesso, modal "Deseja sair? Dados serão perdidos".
- `src/components/onboarding/food/OnboardingShell.tsx` — layout: fundo marinho `#0F1B3D`, lockup completo 360°FOOD (usar `@/assets/360food-horizontal.png.asset.json`) fixo no topo, card branco central `rounded-2xl shadow-lg`, stepper laranja.
- `src/components/onboarding/food/StepEmpresa.tsx` — etapa 1.
- `src/components/onboarding/food/StepModulos.tsx` — etapa 2.
- `src/components/onboarding/food/StepSucesso.tsx` — confirmação com resumo + CTA "Acessar painel".
- `src/components/onboarding/food/SegmentoSelect.tsx` — Select shadcn populado por `useSegmentos()`.
- `src/components/onboarding/food/ModuloCard.tsx` — card selecionável com ícone lucide dinâmico, `aria-pressed`, estados hover/selected/disabled.

Remover / arquivar (deixar de importar): `StepProfileType`, `StepProfileData`, `StepAccount`, `StepCategories`.

### 2.2 Etapa 1 — Dados da Empresa
Campos exatamente como no prompt (seção 8): Nome Completo, CNPJ (máscara + validação DV local reutilizando `src/lib/cnpj.ts` que já existe), Razão Social, Nome Fantasia, CEP + endereço estruturado, Telefone, WhatsApp, Email, Segmento, checkbox LGPD.

- CNPJ dispara `useCnpjLookup` já existente ao completar 14 dígitos válidos; preenche razão social, fantasia, endereço, telefone. **Não bloqueia** se BrasilAPI falhar — mensagens específicas via `src/lib/cnpj-messages.ts` já existente.
- Se a resposta traz `descricao_situacao_cadastral` = Baixada/Inapta → alerta amarelo não bloqueante.
- Campos preenchidos automaticamente permanecem 100% editáveis.
- Validação Zod estende `companySchema` para exigir segmento_id, whatsapp, cep, cidade, uf.
- Botão "Avançar" só habilita quando form válido + LGPD marcado.

### 2.3 Etapa 2 — Seleção de Módulos
- Banner topo laranja claro: "🎁 Todos os módulos incluem 14 dias grátis. Após o período, você decide quais manter."
- Grid 3 colunas (desktop) / 1 coluna (mobile) com 7 cards: Financeiro 360°, DP 360°, CRM 360°, Pedidos 360°, RH 360°, BI 360°, **Financeiro Pessoal** (última posição, com badge "Extra — uso do proprietário").
- Card selecionado: `border-2 border-[#EB6119] bg-[#FEF3EC]`; não selecionado: `border border-border`.
- Botão "Concluir Cadastro e Iniciar Teste Grátis" — desabilitado sem seleção; loading state; trata `empresa_ja_cadastrada`/`nenhum_modulo_selecionado` com toast amigável.

### 2.4 Etapa 3 — Sucesso
Ícone check laranja + "Sua empresa foi cadastrada!" + resumo (nome fantasia, módulos ativados listados, "Teste grátis até dd/mm/aaaa") + CTA "Acessar Painel" → `/dashboard` (usando `useCompanyContext.setContext('pj', newCompanyId)`).

### 2.5 Hooks e libs
- `src/hooks/useSegmentos.tsx` — query dos segmentos ativos.
- `src/hooks/useModulosCatalogo.tsx` — query dos módulos + mapeamento de ícones lucide.
- `src/hooks/useOnboardingSubmit.tsx` — mutation chamando `supabase.rpc('fn_cadastrar_empresa_onboarding', ...)`.
- `src/lib/cnpj.ts`, `src/lib/cpf.ts`, `src/lib/phone.ts`, `src/hooks/useCnpjLookup.tsx` — reutilizados.

---

## 3. Identidade Visual (tokens semânticos)

Toda mudança em `src/index.css` — nada de cor hardcoded em componentes.

- **Não** alterar os tokens semânticos globais (o app inteiro já usa `--primary` = laranja `#EB6119` e sidebar marinho). A paleta atual já bate com 360°FOOD.
- Adicionar tokens de superfície específicos do wizard:
  - `--onboarding-canvas: 224 60% 15%;` (marinho)
  - `--onboarding-card: 0 0% 100%;`
  - `--onboarding-accent-soft: 18 90% 96%;` (fundo do card selecionado)
- Tipografia do wizard: importar Poppins (títulos) mantendo Inter (corpo). Adicionar utility class `.font-display { font-family: 'Poppins', sans-serif; }` e usar apenas dentro do wizard e da landing pós-cadastro.
- Logo: usar `360food-horizontal` no topo do wizard (nunca o símbolo isolado, conforme requisito).

---

## 4. Impacto em outras telas (mínimo)

- `ContextSelector` (`src/components/layout/ContextSelector.tsx`): remover a opção fixa "Pessoal". PF passa a aparecer **apenas** se a empresa selecionada tiver o módulo `financeiro_pessoal` ativo — nesse caso mostra um sub-toggle "Empresa / Pessoal" dentro do contexto PJ. Comportamento controlado por `useCompanyModules`.
- `CompanyFormDialog`: para novas empresas criadas fora do onboarding (via "Perfis de Acesso"), remover o RadioGroup "Pessoal/Empresarial" — só cria PJ. Manter edição de empresas legadas com `profile_type='pessoal'` intacta (compatibilidade).
- Landing page (`src/pages/Landing.tsx`) e textos institucionais: fora do escopo desta iteração. Só mudamos onboarding + cadastro.

---

## 5. Regras de negócio (todas cobertas)

Trial de 14 dias calculado no servidor via RPC; CNPJ único com erro de negócio amigável; mínimo 1 módulo; RPC atômica; degradação graciosa da API de CNPJ; alerta não bloqueante para CNPJ inativo; consentimento LGPD obrigatório; layout responsivo mobile-first.

---

## 6. Fora de escopo (não faremos agora)

- Gateway de cobrança / cron de expiração de trial / job de bloqueio pós-trial.
- Migração automática de empresas legadas para preencher `segmento_id`/endereço estruturado (fica como campo opcional no legado).
- Convite de contador/operador adicional durante o onboarding (usar telas de Usuários existentes depois).
- Sugestão automática de Plano de Contas por segmento.
- Redesign da Landing e materiais de marketing.

---

## Ordem de execução
1. Migration (schema + seeds + RPC + GRANTs).
2. Hooks (`useSegmentos`, `useModulosCatalogo`, `useOnboardingSubmit`).
3. Componentes do wizard + tokens visuais + fonte Poppins.
4. Reescrita de `src/pages/Onboarding.tsx`.
5. Ajustes cirúrgicos em `ContextSelector` e `CompanyFormDialog`.
6. Verificação: build + navegação manual do fluxo em preview.

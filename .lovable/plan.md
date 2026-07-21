## Objetivo
Fazer com que o **colaborador do módulo DP faça login exclusivamente por CPF + senha**, sem depender de e-mail. Admins/donos continuam entrando por e-mail normalmente.

Como o Supabase Auth exige um e-mail internamente, cada colaborador passa a ter um **e-mail sintético** (não usado para nada além de identificar a conta no Auth). O usuário nunca vê nem digita esse e-mail.

## Escopo
- Convite de colaborador deixa de exigir e-mail.
- Nova tela de login exclusiva do portal do colaborador em `/dp/login` (CPF + senha).
- Reset de senha volta ao padrão **6 últimos dígitos do CPF**.
- Login/signup/reset por e-mail permanecem apenas para admins/donos em `/auth`.

## Mudanças

### 1. Banco — RPC pública `resolve_cpf_login`
`SECURITY DEFINER`, `SET search_path = public`, exposta a `anon` e `authenticated`.
- Entrada: `_cpf text` (sanitiza para 11 dígitos).
- Retorna o e-mail (real ou sintético) do colaborador com `user_id` vinculado; `NULL` caso não exista. Mensagem de erro no client é sempre genérica ("CPF ou senha inválidos") para evitar enumeração.

```sql
CREATE OR REPLACE FUNCTION public.resolve_cpf_login(_cpf text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email_portal
  FROM public.dp_colaboradores
  WHERE regexp_replace(coalesce(cpf,''), '\D', '', 'g')
      = regexp_replace(coalesce(_cpf,''), '\D', '', 'g')
    AND user_id IS NOT NULL
    AND email_portal IS NOT NULL
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_cpf_login(text) TO anon, authenticated;
```

### 2. Edge Function `dp-invite-colaborador` (refatorada → `dp-criar-acesso-colaborador`)
- Parâmetros passam a ser apenas `colaborador_id`. Nada de e-mail.
- Backend:
  1. Valida authz (super_admin / owner / admin da empresa).
  2. Lê `cpf` do colaborador; exige 11 dígitos.
  3. Monta e-mail sintético `cpf<11digits>@portal.360food.local` (domínio interno, nunca usado para envio).
  4. Define a **senha inicial = 6 últimos dígitos do CPF**.
  5. `admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { colaborador_id, kind: 'dp_colaborador' } })` — sem envio de e-mail.
  6. Atualiza `dp_colaboradores` com `user_id` e `email_portal = <sintético>`.
  7. Retorna `{ cpf, password }` para o admin repassar ao colaborador.
- Se o colaborador já tiver `user_id`, retorna erro claro "Já possui acesso — use Resetar senha".

### 3. Edge Function `dp-reset-password` — **voltar ao padrão original**
- Substituir a geração aleatória por: **senha = 6 últimos dígitos do `cpf`** do colaborador.
- Se o CPF tiver menos de 6 dígitos numéricos, retorna erro pedindo para completar o cadastro do CPF antes.
- Continua exigindo authz (super_admin / owner / admin da empresa).
- Retorna `{ success: true, password }` — o toast na tela volta a exibir "Nova senha: XXXXXX (6 últimos do CPF)".

### 4. Tela `src/pages/dp/DpColaboradores.tsx`
- Botão/ação "Convidar" vira **"Gerar acesso"** e não pede mais e-mail.
- Após sucesso, mostra modal com **CPF (login)** e **senha inicial (6 últimos do CPF)** com botões "Copiar".
- Tooltip do reset volta a dizer "Resetar senha para 6 últimos do CPF".

### 5. Nova tela `src/pages/dp/DpLogin.tsx` em `/dp/login`
- Layout enxuto com marca 360°FOOD.
- Campos: CPF com máscara `000.000.000-00`, senha, botão "Entrar".
- Fluxo:
  1. `digits = cpf.replace(/\D/g, '')` — valida 11 dígitos.
  2. `email = await supabase.rpc('resolve_cpf_login', { _cpf: digits })`.
  3. Se `email` nulo → erro genérico.
  4. `supabase.auth.signInWithPassword({ email, password })`.
  5. Redireciona para `/dp/meu`.
- Sem "esqueci minha senha" — texto: "Esqueceu a senha? Solicite ao RH da sua empresa".
- Rota registrada em `src/App.tsx` como pública.

### 6. Redirecionamentos
- Em `/auth`, se o usuário logado for identificado como colaborador (via `user_metadata.kind === 'dp_colaborador'` ou checagem em `dp_colaboradores`), redirecionar imediatamente para `/dp/meu`.
- Link discreto "Sou colaborador" no `/auth` apontando para `/dp/login`.

### 7. Colaboradores existentes
- Quem já tem `user_id` e `email_portal` real: mantém — a RPC funciona com qualquer e-mail vinculado.
- Quem não tem `user_id` (ex.: TAMIRES): entra pelo novo fluxo "Gerar acesso" (senha = 6 últimos do CPF).

## Segurança
- Rate-limit por IP na Edge Function de criação de acesso.
- RPC `resolve_cpf_login` só devolve e-mail quando `user_id IS NOT NULL` → não vaza cadastros incompletos.
- Erro de login sempre genérico.
- Domínio sintético `@portal.360food.local` reservado, nunca usado para envio; documentado em memória.
- Aviso: senha inicial previsível (6 dígitos do CPF) é um risco conhecido — mitigado pela obrigação futura (fora do escopo) de troca no primeiro acesso.

## Fora do escopo
- Forçar troca de senha no primeiro acesso (pode ser adicionado depois).
- Auto-atendimento de reset (WhatsApp/SMS).
- Alterar login de admin/dono.

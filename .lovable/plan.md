## Causa

O RPC `fn_cadastrar_empresa_onboarding` está falhando (por isso vem a mensagem genérica "Não foi possível concluir…"). Dois problemas no bloco do perfil:

1. Faz `INSERT INTO profiles (id, full_name, phone) VALUES (v_uid, …) ON CONFLICT (id)`.
   - Em `profiles`, `id` é a PK própria (`gen_random_uuid()`) e a coluna que aponta para o usuário é `user_id`. O `v_uid` (auth uid) não bate com o `id` do registro existente, então o ON CONFLICT não pega — cai no INSERT.
2. O INSERT então falha porque `profiles.profile_type` é `NOT NULL` sem default.

Resultado: o RPC aborta antes de criar a empresa e o frontend só mostra o fallback.

## Correção

Migração única que substitui a função `fn_cadastrar_empresa_onboarding`:

- Trocar o bloco de perfil por: `UPDATE public.profiles SET full_name = COALESCE(p_nome_completo, full_name), phone = COALESCE(p_telefone_cliente, phone), updated_at = now() WHERE user_id = v_uid;` e, se `NOT FOUND`, `INSERT` completo (`user_id`, `full_name`, `phone`, `profile_type = 'empresarial'`).
- Manter tudo o resto igual (verificações, insert em `companies`, `company_members` com role `owner`, loop de `company_modules`, retorno JSON).

## Detalhes técnicos

- Assinatura e nomes de parâmetros ficam idênticos — nenhum arquivo TS precisa mudar (`useOnboardingSubmit`, `Onboarding.tsx`, `mensagemErroOnboarding`).
- `SECURITY DEFINER` e `SET search_path = public` mantidos.
- Sem alteração de schema, apenas `CREATE OR REPLACE FUNCTION`.

## Fora de escopo

- Alterações de UI, mensagens de erro adicionais, novas validações do wizard.
- Alterações em outras tabelas ou policies.

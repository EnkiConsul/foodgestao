## Diagnóstico

A conta nova está caindo sempre em `/onboarding` porque o guard de rotas lê `profiles.onboarding_completed=false`. Ao tentar finalizar o wizard com o CNPJ `58.241.366/0001-32`, a função de cadastro retorna `empresa_ja_cadastrada`, pois a empresa já existe no banco. Como esse erro interrompe o fluxo antes de marcar `onboarding_completed=true`, o usuário fica preso no onboarding mesmo já tendo vínculo/empresa cadastrada.

## Plano de correção

1. **Criar regra reutilizável para resolver onboarding**
   - Manter a regra atual de marcar `profiles.onboarding_completed=true` sem enviar `profile_type`.
   - Adicionar uma verificação defensiva: se o usuário já tem empresa própria ou vínculo ativo em empresa, ele deve ser considerado onboarding concluído.

2. **Corrigir o redirecionamento das rotas protegidas**
   - Em `ProtectedRoute`, ao consultar o perfil, também verificar se existe empresa/vínculo para o usuário.
   - Se `onboarding_completed=false`, mas houver empresa ou vínculo ativo, atualizar `profiles.onboarding_completed=true` e permitir entrada no Hub.
   - Se não houver empresa/vínculo, continuar redirecionando para `/onboarding`.

3. **Corrigir o guard da tela de onboarding**
   - Ao abrir `/onboarding`, verificar se o usuário já tem onboarding concluído ou empresa/vínculo ativo.
   - Se tiver, redirecionar direto para `/hub` em vez de mostrar o wizard novamente.

4. **Tratar o caso `empresa_ja_cadastrada` no submit**
   - Quando a RPC retornar `empresa_ja_cadastrada`, verificar se o CNPJ pertence a uma empresa do próprio usuário ou onde ele é membro.
   - Se sim, marcar `onboarding_completed=true`, selecionar a empresa no contexto e ir para a tela de sucesso/Hub.
   - Se não for vínculo do usuário, manter a mensagem atual: “Este CNPJ já está cadastrado...”.

5. **Adicionar testes automatizados**
   - Expandir os testes do helper para garantir que:
     - onboarding é concluído quando há empresa/vínculo existente;
     - `profile_type` nunca é enviado;
     - erro de CNPJ já cadastrado só é tratado como sucesso quando pertence ao usuário.

## Validação

- Login com a conta nova do CNPJ informado deve abrir o Hub/painel, não o wizard.
- A tabela `profiles` deve ficar com `onboarding_completed=true` para esse usuário.
- Usuários sem empresa/vínculo continuam indo para `/onboarding`.
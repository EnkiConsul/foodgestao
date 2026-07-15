Identifiquei a causa do erro exibido na tela.

O cadastro está chamando a função de onboarding no backend, mas ela tenta criar manualmente o vínculo do usuário como dono da empresa em `company_members`. Ao mesmo tempo, já existe um gatilho automático no banco que faz exatamente isso quando uma empresa é criada. Resultado: o mesmo vínculo é inserido duas vezes e o banco retorna erro `23505 duplicate key`, por isso a interface mostra a mensagem genérica “Não foi possível concluir o cadastro”.

Plano de correção:

1. Ajustar a função `fn_cadastrar_empresa_onboarding`
   - Remover a inserção manual em `company_members` ou torná-la idempotente com `ON CONFLICT DO NOTHING`.
   - Manter o gatilho automático existente como responsável por criar o owner da empresa.

2. Melhorar a mensagem de erro no frontend
   - Mapear erro `23505`/duplicidade para uma mensagem mais clara quando ocorrer.
   - Evitar que o usuário veja apenas erro genérico em falhas conhecidas.

3. Validar o fluxo
   - Confirmar que a empresa é criada.
   - Confirmar que o vínculo do usuário como owner é criado uma única vez.
   - Confirmar que os módulos selecionados entram em trial normalmente.

Detalhe técnico: a falha vem da restrição única `company_members_company_id_user_id_key`, causada pela duplicidade entre o trigger `trigger_auto_add_company_owner` e o `INSERT INTO public.company_members` dentro da RPC de onboarding.
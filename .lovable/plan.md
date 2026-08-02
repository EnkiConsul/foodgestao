## O que aconteceu

A conta foi criada e confirmada normalmente (o e-mail usado no cadastro foi `eucastrosilvio@gmail.com`, criado hoje às 14:15 e confirmado às 14:18). O que falhou foi a **última etapa do wizard**, ao gravar a empresa: nenhuma empresa foi criada para esse usuário e o perfil segue com onboarding pendente.

## Causa confirmada (nos logs do banco, no exato horário da tentativa)

O erro registrado é:

```text
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

na chamada de `fn_cadastrar_empresa_onboarding`.

Origem: ao criar a empresa, um gatilho automático cria a configuração padrão do módulo de Departamento Pessoal e tenta gravar com a regra "ignore se já existir para esta empresa". Porém, a tabela de configuração do DP só tem índices únicos **parciais** (um para configuração geral da empresa e outro por unidade). Postgres não aceita índice parcial como referência nessa forma de "ignore se já existir", então a gravação estoura. Como esse gatilho não trata exceções, o erro derruba toda a transação — a empresa, os módulos e as categorias iniciais são desfeitos, e o front exibe a mensagem genérica "Não foi possível concluir o cadastro".

Ou seja: não é dado inválido, CNPJ duplicado nem permissão — é um defeito no gatilho.

## Correção

1. **Migração** ajustando `dp_config_dp_seed_on_company` para:
   - usar a regra de conflito compatível com o índice parcial existente (condicionar à configuração geral da empresa, `unidade_id IS NULL`), ou simplesmente inserir só quando ainda não existir configuração geral para a empresa;
   - envolver a inserção em tratamento de exceção com `RAISE WARNING`, no mesmo padrão já usado pelos gatilhos de categorias e plano de contas — assim uma falha de seed nunca mais impede o cadastro da empresa.
2. **Mensagem de erro no front** (`src/hooks/useOnboardingSubmit.tsx`): incluir o detalhe técnico do banco no log e uma mensagem menos genérica para erros não mapeados, para diagnóstico mais rápido em casos futuros.
3. **Validação**: repetir o fluxo com o usuário existente para confirmar que a empresa é criada, o vínculo de owner e os módulos em trial aparecem, e o onboarding é marcado como concluído. O cliente poderá simplesmente entrar novamente e refazer a última etapa — nada precisa ser recriado manualmente.

## Detalhes técnicos

- Índices atuais em `dp_config_dp`: `dp_config_dp_company_default_uidx (company_id) WHERE unidade_id IS NULL` e `dp_config_dp_company_unidade_uidx (company_id, unidade_id) WHERE unidade_id IS NOT NULL`. Nenhum deles serve como árbitro para `ON CONFLICT (company_id)`.
- Sem alteração de schema de dados nem de RLS; apenas a função do gatilho.

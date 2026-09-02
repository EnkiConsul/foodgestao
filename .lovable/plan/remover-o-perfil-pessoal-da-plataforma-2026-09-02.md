# Remover o perfil "Pessoal" da plataforma

Objetivo: a plataforma passa a ser exclusivamente empresarial. Não existe mais perfil de acesso "Pessoal" em Minhas Empresas, nem espaço financeiro Pessoal (PF) no seletor de contexto, e nada disso é criado quando um novo usuário se cadastra.

## Situação atual (verificada)

- `companies.profile_type` é texto com padrão `empresarial` e aceita `pessoal`; hoje **nenhuma** das 19 empresas é `pessoal`, mas o formulário de Minhas Empresas ainda oferece a opção e o painel admin de Perfis de Acesso ainda filtra por ela.
- O contexto financeiro Pessoal (PF) ainda existe e tem dados legados: 16 contas (11 usuários), 23 lançamentos, 79 categorias, além de formas de pagamento, cartões, orçamentos, regras e plano de contas no escopo pessoal.
- O cadastro de novo usuário já **não** semeia dados PF (só cria a linha de perfil); o contexto inicial já é PJ. Falta apenas fechar as portas que ainda expõem/permitem o Pessoal.

## Mudanças

### 1. Minhas Empresas e painel admin
- Remover a escolha de perfil "Pessoal" do formulário de empresa: todo cadastro/edição é "Empresarial", com CNPJ e razão social obrigatórios.
- Remover a opção "Pessoal" do filtro de tipo no painel admin de Perfis de Acesso.
- No banco: forçar `empresarial` como único valor aceito em `companies.profile_type` (normaliza qualquer registro futuro/residual).

### 2. Contexto financeiro Pessoal (PF)
- Remover a opção "Pessoal" do seletor de contexto no topo e a detecção de dados PF legados (`useLegacyPfData`), que deixa de ser necessária.
- Garantir que o contexto sempre resolva para uma empresa: usuário sem empresa segue para o onboarding, nunca para um espaço pessoal.
- Remover os rótulos/opções "Pessoal" das telas que ainda oferecem escolha de escopo (contas bancárias, categorias, formas de pagamento, centros de custo, contatos, plano de contas, lançamentos).

### 3. Exclusão definitiva dos dados PF
Apagar de forma permanente todos os registros do escopo pessoal (sem empresa vinculada), na ordem correta de dependências: anexos e vínculos de etiquetas dos lançamentos PF, lançamentos, orçamentos, regras de categorização e de importação, cartões de crédito e faturas, contas bancárias, categorias, plano de contas, formas de pagamento pessoais, centros de custo e contatos pessoais, além de snapshots de conferência de saldo.

Antes de apagar, gero um relatório com a contagem por tabela e por usuário afetado (11 usuários com contas pessoais) para você conferir. A exclusão é irreversível.

### 4. Cadastro de novo usuário
- Confirmar por teste que um cadastro novo não cria empresa "Pessoal", não cria contexto PF e não semeia contas/categorias/formas de pagamento pessoais.
- O campo de classificação fiscal do perfil do usuário (`pf`, `mei`, `microempresa`, `hibrido`) **permanece** — ele descreve o regime do cliente, não um perfil de acesso, e não cria nenhum espaço pessoal. Se você quiser mudar isso também, é um segundo passo.

## Fora de escopo

- Não removo a coluna `context` das tabelas nem a infraestrutura interna de escopo (`financialScope`) — ela continua garantindo o isolamento por empresa. Só deixa de existir caminho de PF na interface e nos dados.

## Verificação

- Nenhuma empresa com perfil `pessoal` e nenhuma opção "Pessoal" na interface.
- Nenhum registro restante no escopo pessoal (consulta de contagem = 0 em todas as tabelas listadas).
- Login de usuário que antes tinha dados PF abre direto na empresa, sem tela vazia nem erro.
- Testes existentes de escopo/RLS e de contexto continuam verdes, com ajuste dos casos que assumem PF.

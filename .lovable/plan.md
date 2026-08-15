# Aviso mensal no sino para cadastro de acesso do contador

## Objetivo
Inserir um alerta recorrente no sino de notificações financeiras (`NotificationsBell`) que lembre, uma vez por mês, os donos/administradores de uma empresa PJ a cadastrar um acesso específico para o contador.

## O que será feito

1. **Novo alerta de contador no sino financeiro**
   - Adicionar tipo `accountant` ao alerta do `NotificationsBell`.
   - Mostrar mensagem: "Cadastre o acesso do seu contador" com descrição explicativa.
   - Exibir o alerta apenas:
     - No contexto PJ;
     - Para usuários com papel `owner` ou `admin` na empresa selecionada;
     - Quando a empresa **não** possuir nenhum membro ou convite pendente com o papel `contabilidade`.

2. **Frequência mensal com persistência leve**
   - Usar chave `accountant-reminder-{companyId}-{yyyy-MM}` no `localStorage` para controlar que o aviso apareça uma vez por mês por empresa.
   - Incluir botão de dispensar o aviso no próprio item do sino, evitando que o badge fique preso por dias.

3. **Ação de cadastro rápido**
   - Clicar no alerta navegará para `/gestao-usuarios` com o diálogo de convite aberto e o papel `contabilidade` pré-selecionado.
   - Ajustar `InviteUserDialog` para aceitar props iniciais (`defaultRole`, `open`) via state de navegação, mantendo o padrão atual quando não forem informadas.

4. **Padronização visual**
   - Ícone `Calculator` e badge na cor esmeralda para reforçar a identidade do papel Contabilidade já usada em `GestaoUsuarios.tsx`.
   - Manter a mesma densidade, tipografia e estados de hover dos demais itens do sino.

## Escopo
- Alterações somente no frontend (`src/components/layout/NotificationsBell.tsx`, `src/components/users/InviteUserDialog.tsx`, `src/pages/GestaoUsuarios.tsx`).
- Sem mudanças de schema ou banco de dados.
- O alerta desaparece automaticamente quando o usuário já tem um contador vinculado.

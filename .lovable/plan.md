## Plano

1. **Separar visualmente as ações do card Open Finance**
   - Trocar os botões só com ícone por botões com texto claro: **Sincronizar** e **Excluir**.
   - Adicionar `aria-label`/tooltip para evitar confusão entre sincronizar, reconectar e remover.

2. **Impedir cliques acidentais em exclusão**
   - Manter exclusão sempre atrás do diálogo de confirmação.
   - Deixar o botão de exclusão com texto explícito e estilo destrutivo apenas quando necessário.

3. **Melhorar feedback ao sincronizar**
   - Enquanto sincroniza, mostrar o ícone girando e bloquear somente a ação da conexão em andamento.
   - Exibir toast específico quando sincronizar retornar 0 lançamentos, avisando que o saldo foi atualizado mas nenhuma transação nova foi encontrada/importada.

4. **Validar no preview**
   - Abrir `/contas-bancarias`, confirmar que o botão correto está identificado como **Sincronizar** e que clicar nele não abre fluxo de desconexão/exclusão.

## Detalhes técnicos

- Arquivo principal: `src/components/accounts/OpenFinanceSection.tsx`.
- Ajuste de estado local para controlar qual conexão está sincronizando, em vez de usar apenas `syncConnection.isPending` global.
- Não mexer no motor financeiro nem nas funções de backend nesta correção; o foco é a ação do botão e a clareza da interface.
# Cadastrar fornecedor/cliente na Conciliação com o formulário completo

Hoje a tela de conciliação cria contatos por um atalho próprio: o botão "Cadastrar <nome>" grava apenas nome, documento e tipo direto na tabela, e quando o extrato não traz nome abre um mini diálogo pedindo só o nome. Isso gera cadastros incompletos (sem e-mail, telefone, endereço, empresas vinculadas, visibilidade PF).

A proposta é usar o mesmo formulário da tela de Clientes / Fornecedores dentro da conciliação.

## O que muda

1. **Botão "Cadastrar" abre o formulário completo**
   Na linha da conciliação (tabela e cartão no mobile), o botão passa a abrir o formulário oficial de Clientes / Fornecedores, já pré-preenchido com o que o extrato identificou:
   - Nome (normalizado, sem CAIXA ALTA)
   - CPF/CNPJ, quando o extrato traz
   - Tipo sugerido: Cliente para entradas, Fornecedor para saídas
   - Empresa atual já marcada nos vínculos
   O usuário pode completar/corrigir tudo antes de salvar, com as mesmas validações e a busca automática de CNPJ da tela de cadastros.

2. **Opção "Cadastrar novo" no seletor**
   No seletor de Fornecedor/Cliente, além da busca, aparece um item fixo "+ Cadastrar novo fornecedor/cliente" que abre o mesmo formulário (nome em branco quando não há sugestão do extrato). Assim é possível cadastrar mesmo quando o extrato não identificou contraparte.

3. **Após salvar**: o novo contato entra na lista sem recarregar a tela e já fica selecionado na linha que originou o cadastro.

4. **Reaproveitamento mantido**: antes de abrir o formulário, se já existir contato com o mesmo documento ou mesmo nome, ele é vinculado direto (comportamento atual preservado, com o aviso "Contato já cadastrado").

5. O mini diálogo "informe o nome do contato" deixa de existir — o formulário completo cobre esse caso.

## Detalhes técnicos

- `src/pages/ConciliacaoPluggy.tsx`: substituir o fluxo `createContactFromStatement` por: checagem de duplicidade (`findExistingContact`) → se não existir, abrir `ContactFormDialog` com estado `{ rowId, name, document, type }`. No `onSaved(newId)`, chamar `ensureContactCompanyLink(newId, selectedCompanyId)`, recarregar via `fetchAllCompanyContacts` (ou inserir otimista) e setar `rowContact[rowId]`. Remover o diálogo `contactNamePrompt` e o `insert` manual em `contacts`.
- `src/components/contacts/ContactFormDialog.tsx`: adicionar props opcionais `defaultDocument` e `defaultCompanyIds` (usadas somente na criação), sem alterar o comportamento em Contatos/Lançamentos.
- `src/components/conciliacao/ContactSelectContent.tsx`: nova prop opcional `onCreateNew` que renderiza o item de rodapé "+ Cadastrar novo"; usada na tabela, no `StagingCard` e em `DividirLancamentoDialog` (neste último, apenas se a criação estiver disponível).
- `src/components/conciliacao/StagingCard.tsx`: `onCreateContact` passa a abrir o formulário; rótulo do botão simplificado para "Cadastrar fornecedor/cliente".
- Sem migração de banco; o formulário já grava `contacts` + `contact_companies`.

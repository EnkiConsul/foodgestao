# Conciliação: lista de fornecedores/clientes incompleta

## O que está acontecendo

A consulta de contatos da tela de conciliação está quebrada: ela pede um campo chamado `type`, que não existe na tabela de contatos (o campo correto é `contact_type`). O banco rejeita a consulta inteira e o erro é engolido silenciosamente, então o seletor de "Fornecedor…/Cliente…" fica vazio (só aparecem os contatos que a própria tela cadastra na hora, a partir do extrato).

Confirmado direto no banco: a requisição retorna `column contacts.type does not exist`.

Além disso, dos 90 contatos existentes, 32 não têm vínculo com nenhuma empresa (são contatos só do perfil Pessoal). Como a conciliação é PJ, esses continuarão fora da lista — o que é correto, mas hoje o usuário não tem como perceber nem como trazê-los para a empresa.

## Correções

1. Corrigir a consulta de contatos da conciliação para usar `contact_type` e alinhá-la com a página de Contatos (mesmo filtro por empresa ativa e mesma ordenação por nome).
2. Deixar de engolir o erro: se a busca de contatos (ou das outras listas carregadas em paralelo) falhar, exibir um toast de erro para não voltar a passar despercebido.
3. Remover o filtro extra de "ativo" que a conciliação aplica e a página de Contatos não aplica, mantendo as duas telas com a mesma lista (contatos inativos, se houver, continuam ocultos apenas se realmente estiverem inativos — hoje não há nenhum).
4. Marcar visualmente no seletor o tipo do contato (Cliente / Fornecedor / Ambos), já que o campo passará a vir corretamente, ajudando a achar o fornecedor certo em listas grandes.
5. Ajustar o cadastro inline feito pelo extrato para gravar e refletir o tipo correto na lista local, evitando itens sem tipo depois de cadastrar.

## Detalhes técnicos

- Arquivo principal: `src/pages/ConciliacaoPluggy.tsx` (bloco `Promise.all` do carregamento, `setContacts`, `ContactOpt`, `createContactFromStatement` e o `Select` de contato).
- Seleção nova: `id, name, contact_type, document, is_active, contact_companies!inner(company_id)` filtrando por `contact_companies.company_id = selectedCompanyId`, ordenado por `name`.
- Capturar `error` de cada item do `Promise.all` relevante e disparar `toast.error` com a mensagem.
- Nenhuma mudança de banco de dados é necessária.

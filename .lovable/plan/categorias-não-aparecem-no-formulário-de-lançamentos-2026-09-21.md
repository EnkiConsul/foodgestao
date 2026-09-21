# Categorias não aparecem no formulário de lançamentos

## Causa confirmada

O formulário busca as categorias pela função do banco `get_accessible_categories`, que já devolve **apenas** as categorias da empresa em uso. Depois disso, o próprio formulário aplica um segundo filtro: ele baixa a tabela de ligações categoria↔empresa **sem filtrar por empresa e sem ordenar** e só mantém a categoria se encontrar a ligação nessa lista baixada.

- `src/hooks/useTransactionFormLookups.ts:114-121` — leitura de `category_companies` sem filtro e sem ordem.
- `src/components/transactions/TransactionFormDialog.tsx:292-302` — descarta qualquer categoria cuja ligação não esteja na lista baixada.

Essa leitura é limitada a 1000 linhas pelo servidor. Hoje existem **1.171 ligações** no banco, e o usuário `rcbruto77@gmail.com` é super administrador, então a regra de acesso libera **todas** as ligações para ele. Resultado: 171 ligações ficam de fora, escolhidas de forma arbitrária (não há ordenação), e as categorias correspondentes desaparecem do seletor de lançamentos — mesmo estando corretas no banco e visíveis na tela de Categorias, que usa outra consulta (junção no servidor, `src/pages/Categorias.tsx:274-281`).

Confirmado nos dados: 1.171 ligações no total, contra o teto de 1.000; a empresa AVETO 360 tem 5 categorias ligadas e ativas (2 de entrada, 3 de saída), todas com lançamentos permitidos — ou seja, deveriam aparecer.

Dois efeitos secundários do mesmo filtro, também confirmados:
- Categorias-pai trazidas apenas para montar a hierarquia (ex.: IMPOSTOS, pai de "Simples Nacional") não têm ligação com a empresa e são descartadas, quebrando a árvore.
- Contatos, formas de pagamento e centros de custo usam exatamente o mesmo padrão sem filtro no mesmo arquivo, sujeitos ao mesmo teto.

## O que será corrigido

- O formulário passa a confiar no recorte já feito pelo banco para categorias: deixa de refiltrar pela lista baixada de ligações.
- As leituras de ligações por empresa (categorias, contatos, formas de pagamento, centros de custo) passam a ser filtradas pela empresa em uso, com ordenação e paginação segura, eliminando o teto de 1.000 linhas.
- A hierarquia volta a aparecer: categorias-pai usadas como grupo continuam visíveis e não selecionáveis.
- Erros dessas consultas deixam de ser ignorados: em falha, o campo mostra aviso em vez de lista vazia silenciosa.

## Detalhes técnicos

1. `src/hooks/useTransactionFormLookups.ts`
   - `categoryCompaniesQuery`, `contactCompaniesQuery`, `paymentMethodCompaniesQuery`, `costCenterCompaniesQuery`: incluir `selectedCompanyId` na chave e no `.eq("company_id", …)` quando o contexto é PJ; adicionar `.order()` e leitura paginada por blocos de 1000 até esgotar; propagar `error` (hoje descartado).
   - Manter `enabled` coerente (não consultar sem empresa selecionada).
2. `src/components/transactions/TransactionFormDialog.tsx`
   - `filteredCategories` (linhas 292-302): em PJ, remover a exigência de ligação local — a função do banco já limita à empresa; manter apenas o filtro por tipo de lançamento e a regra de PF.
   - Manter `allow_transactions === false` / `is_active === false` / nós com filhos como "Grupo" não selecionáveis (linhas 490-509).
3. Testes
   - Unitário do filtro de categorias do formulário: categoria com pai fora da empresa continua listada com o pai como grupo; nenhuma categoria é perdida quando o mapa de ligações está vazio ou incompleto.
   - Unitário da leitura paginada: mais de 1000 ligações retornam todas as páginas.
4. Verificação
   - `bunx vitest run` nos testes tocados e `bunx tsgo --noEmit -p tsconfig.app.json`.
   - Conferência no preview: abrir um lançamento de despesa e de receita na empresa em uso e confirmar a mesma lista da tela de Categorias, com hierarquia e numeração.

## Fora deste escopo

Nenhuma alteração de banco, de regra de acesso ou de dados; as 57 categorias sem vínculo com empresa continuam como estão (exigem autorização separada).

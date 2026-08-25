# Identificação de fornecedores/clientes na conciliação do Open Finance

## O que os dados mostram

O extrato traz a contraparte com boa qualidade: dos 1.141 lançamentos pendentes, 1.000 têm nome de contraparte e 912 têm CPF/CNPJ.

O problema não é a leitura do extrato — é a falta de cadastro para casar:

- Empresa A: 85 CNPJ/CPF distintos no extrato, apenas 12 existem no cadastro de fornecedores/clientes.
- Empresa B: 79 documentos distintos no extrato, apenas 1 existe no cadastro (a empresa tem só 1 contato cadastrado).

O motor de sugestão só sabe apontar para contatos que já existem. Sem cadastro correspondente, ele corretamente não sugere nada — e para o usuário isso aparece como "não está identificando".

Além disso, ~141 linhas ficam sem nome de contraparte (ex.: "Compra no débito|POSTO SAN REMO", "CONCEBRA", "JERIVA COMERCIO DE ALIABADIANIA"), onde o estabelecimento está só no texto.

## O que fazer

### 1. Cadastro em massa a partir do extrato (principal)
Novo botão "Cadastrar contrapartes identificadas" na barra da conciliação:
- Agrupa as linhas pendentes por CPF/CNPJ (e por nome, quando não há documento).
- Mostra uma tela de revisão com nome, documento, tipo sugerido (fornecedor para saídas, cliente para entradas) e nº de lançamentos.
- O usuário desmarca o que não quiser e confirma; o sistema cria os contatos, vincula à empresa e aplica a sugestão nas linhas correspondentes.
- Reaproveita a checagem de duplicidade já existente (documento > nome > parecido) para nunca criar contato repetido.

### 2. Deixar claro o motivo quando não há sugestão
Na linha sem contato sugerido, exibir o motivo: "sem cadastro correspondente", "contraparte não identificada no extrato" ou "débito interno do banco". Hoje o campo fica simplesmente vazio.

### 3. Melhorar o preenchimento da contraparte faltante
- Persistir no banco o nome/documento derivado do texto para as linhas que hoje ficam nulas (backfill das linhas pendentes usando a mesma lógica já usada na tela).
- Ajustar a extração para nomes de estabelecimento de compra no débito sem preposição (casos "CONCEBRA", "JERIVA COMERCIO...").

### 4. Memória de conciliação
Ao confirmar uma linha com contato escolhido manualmente, gravar o vínculo documento/nome → contato para que ocorrências futuras já venham sugeridas automaticamente (a tela já lê uma memória; garantir que ela seja gravada em todos os caminhos de confirmação, inclusive cartão e lote).

## Detalhes técnicos

- `src/lib/conciliacao/contactMatch.ts` e `counterparty.ts` permanecem como motor; sem mudança de limiares (o empate técnico segue evitando sugestão errada).
- Novo componente `src/components/conciliacao/BulkContactImportDialog.tsx` + helper `src/lib/conciliacao/bulkContactImport.ts` (agrupamento, dedupe por documento/nome, tipo por sinal do valor).
- Criação via `contacts` + `ensureContactCompanyLink` em lote, com `findSimilarContacts` para reaproveitar cadastros existentes.
- Backfill de `counterparty_name` / `counterparty_document` em `pluggy_staging_transactions` (linhas `pending`) por migração usando os campos de `raw` e o padrão de pipe da descrição.
- Testes unitários para o agrupamento/dedupe e para os novos padrões de extração de nome.

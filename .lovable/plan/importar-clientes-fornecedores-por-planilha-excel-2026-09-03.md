# Importar clientes/fornecedores por planilha Excel

Adicionar na página Contatos um botão "Importar planilha" que lê um arquivo Excel (.xlsx) ou CSV, mostra uma tela de revisão e cadastra os contatos automaticamente na empresa ativa.

## Fluxo para o usuário

1. Botão **Importar planilha** no topo da página (ao lado de "Novo Contato"; também no menu do FAB no mobile).
2. Diálogo com:
   - Link **Baixar modelo (.xlsx)** com as colunas esperadas e uma linha de exemplo.
   - Área para arrastar/selecionar o arquivo (.xlsx, .xls, .csv).
3. Leitura do arquivo no navegador (sem enviar para o servidor) e **tela de revisão** com uma linha por contato:
   - Nome, Tipo (Cliente/Fornecedor/Ambos), CPF/CNPJ, E-mail, Telefone, Endereço, Observações.
   - Situação de cada linha: **Novo**, **Já cadastrado** (mesmo CPF/CNPJ ou mesmo nome), **Duplicado na planilha** ou **Erro** (nome vazio, e-mail inválido, documento inválido).
   - Linhas com erro ou já cadastradas vêm desmarcadas; o usuário pode marcar/desmarcar cada linha e corrigir o Tipo.
   - Contador: "X serão criados, Y ignorados, Z com erro".
4. Ao confirmar, os contatos marcados são criados em lote e vinculados à empresa ativa; toast com o resumo e a lista atualiza na hora.

## Regras de importação

- Colunas reconhecidas por nome de cabeçalho, sem diferenciar maiúsculas/acentos: `nome`, `tipo`, `cpf_cnpj` (aceita `documento`, `cnpj`, `cpf`), `email`, `telefone`, `endereco`, `observacoes`.
- Tipo vazio ou desconhecido assume **Fornecedor** (com a opção de trocar em massa na revisão).
- CPF/CNPJ é normalizado e validado; documento inválido marca a linha como erro (o nome ainda pode ser importado se o usuário limpar o documento).
- Duplicidade é checada por CPF/CNPJ normalizado e, quando não há documento, por nome normalizado, contra os contatos existentes e dentro da própria planilha.
- Contato criado em contexto de empresa nasce oculto no perfil pessoal (`visible_pf = false`), igual ao cadastro manual.
- Limite de 2.000 linhas por arquivo, para não travar o navegador.

## Detalhes técnicos

- `src/lib/contacts/importSheet.ts` (novo): leitura com `exceljs` (já é dependência) e parser CSV simples; `parseContactsSheet(file)` devolve `ContactImportRow[]` com `{ rowNumber, name, contact_type, document, email, phone, address, notes, errors[] }`. Reaproveita `normalizeDocumento`/`isSameDocumento` (`src/lib/documento.ts`), `isValidCpf`/`isValidCnpj`, `toProperName` e `contactSchema` de `src/lib/validations.ts`.
- `src/lib/contacts/importDedupe.ts` (novo): classificação `novo | existente | duplicado_planilha | erro` comparando com os contatos já carregados na página.
- `src/components/contacts/ContactImportDialog.tsx` (novo): upload, tabela de revisão editável (Tipo e seleção), download do modelo gerado por `exceljs`, e callback `onImported`.
- `src/lib/contacts/importTemplate.ts` (novo): gera o arquivo modelo .xlsx.
- Inserção: `supabase.from("contacts").insert([...])` em lotes de 100, seguido de `insert` em `contact_companies` com a empresa ativa (`selectedCompanyId`), tratando erro de índice único de documento como "já cadastrado". Log de auditoria via `insert_audit_log` com a ação `contacts_imported` e a quantidade.
- `src/pages/Contatos.tsx`: novo botão, estado do diálogo e `refetch()` + `refetchCompanies()` após importar.
- Testes em `src/test/unit/contactsImportSheet.test.ts`: cabeçalhos com acento/maiúsculas, tipo padrão fornecedor, documento inválido, duplicidade por documento e por nome, duplicado dentro da planilha.
- Sem migração de banco.

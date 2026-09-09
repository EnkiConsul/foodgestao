# Cadastro rápido a partir do documento: nome vazio e CPF errado

## O que está acontecendo

Confirmei nos dois pontos do fluxo:

1. **Nome vazio** — a leitura da página só guarda o nome quando ela consegue casar a pessoa com um cadastro já existente pelo nome. Quando a pessoa ainda não está cadastrada (exatamente o caso do cadastro rápido), o campo nome fica nulo, então o formulário abre em branco.
2. **CPF com número da matrícula INSS** — a busca de CPF aceita qualquer sequência de 11 dígitos do texto lido, sem exigir o rótulo "CPF" e sem checar os dígitos verificadores. Em folha de pagamento o PIS/NIT/matrícula INSS também tem 11 dígitos, e ele costuma aparecer antes do CPF, então é ele que vai para o campo.

## O que será feito

**Leitura do documento**
- Passar a pedir na leitura, em linha própria, o nome da pessoa do documento e o CPF dela (quando existir), separando explicitamente de PIS/NIT/matrícula.
- Guardar o nome lido sempre, mesmo quando não há cadastro correspondente.
- Só aceitar como CPF um número que esteja junto ao rótulo "CPF" e cujos dígitos verificadores sejam válidos. Números rotulados como PIS, NIT, PASEP, matrícula ou INSS nunca entram como CPF.
- Se o documento não traz CPF (caso da folha), o campo fica vazio em vez de trazer número errado.

**Formulário de cadastro rápido**
- Preencher o nome com o nome lido do documento, já em Primeira Letra Maiúscula.
- Para páginas já lidas antes desta correção, derivar nome e CPF do texto já armazenado da página, aplicando as mesmas regras — sem precisar reprocessar o PDF.
- Nunca preencher CPF que não passe na validação; nesse caso o campo abre vazio com a dica de que o documento não informa o CPF.
- O nome continua obrigatório; o CPF segue opcional, com a checagem de duplicidade que já existe.

**Sem alteração** em regras de vínculo, natureza do documento, competência, aprovação, duplicidade, permissões, isolamento por empresa ou banco de dados.

## Detalhes técnicos

- Novo módulo puro `supabase/functions/_shared/doc-pessoa.ts`: `extrairNomePessoa(ocr)`, `extrairCpfValido(ocr)` (rótulo obrigatório + dígitos verificadores + lista de rótulos proibidos: PIS/NIT/PASEP/MATRICULA/INSS), `isCpfValido`.
- `supabase/functions/dp-doc-bulk-ingest/index.ts`: prompt do OCR passa a emitir `PESSOA: <nome>` e `CPF_PESSOA: <cpf|DESCONHECIDO>`; `extractCPFs` restrito às regras novas para o preenchimento de `matched_cpf`; `matched_nome` gravado a partir do nome lido quando não houver match; o casamento por CPF continua tolerante (usa qualquer CPF válido encontrado) para não perder vínculos.
- `src/lib/dp/doc-pessoa.ts`: espelho das mesmas funções para uso no cliente sobre `ocr_text`; teste em `src/test` garante paridade de comportamento entre os dois módulos.
- `BulkReviewInline.tsx` / `BulkReviewDialog.tsx`: `defaultNome`/`defaultCpf` passam a usar `matched_nome ?? extrairNomePessoa(ocr_text)` e `matched_cpf` validado `?? extrairCpfValido(ocr_text)`.
- Testes: casos de folha com PIS antes do CPF, folha sem CPF, contracheque com CPF formatado, nome com preposições.

## Rollback

Reverter os arquivos citados; nada de banco é alterado, então não há migração para desfazer.

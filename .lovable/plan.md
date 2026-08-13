# Fornecedor aparecendo como CPF na conciliação

## Por que acontece

Confirmei nos dados reais:

- Alguns lançamentos importados têm o documento da contraparte gravado, mas **sem o nome** (ex.: um Pix de R$ 116,00 com CPF `288.327.521-15`, `counterparty_name` vazio, e o nome só existe dentro da descrição: "Pix enviado para ANTONIA BARROS RODRIGUES"). Isso ocorre porque alguns bancos não devolvem `payer.name` / `receiver.name`, só o documento.
- Quando o nome falta, o botão "Cadastrar contato" cria o contato com nome `Contraparte <documento>`. Existem hoje 3 contatos assim no banco (`Contraparte 014.466.201-90`, `Contraparte 633.922.751-15`, um duplicado).
- Depois de criado, é esse nome que aparece no campo Fornecedor/Cliente — daí a sensação de "está aparecendo o CPF em vez do nome".

## O que será feito

1. Extrair o nome da descrição quando o extrato não traz o nome
   - Ler o trecho depois de "enviado para", "recebido de", "para", "de", "Pagamento Boleto", removendo rótulos de operação (Pix, TED, DOC, Boleto).
   - Usar esse nome como último recurso, depois de `payer`/`receiver`/`merchant`.

2. Nunca criar contato com o documento como nome
   - Se ainda assim não houver nome, o botão "Cadastrar contato" abre o cadastro pedindo o nome (campo obrigatório), em vez de salvar "Contraparte <CPF>".

3. Corrigir os contatos já criados
   - Renomear os contatos existentes cujo nome é "Contraparte <documento>" usando o nome identificado nos lançamentos do mesmo documento; quando não houver nome, sinalizar na tela de Contatos que o cadastro precisa de nome.

4. Exibição na fila de conciliação
   - Quando só há documento, mostrar "Contraparte não identificada • CPF ..." em vez de dar a impressão de que o documento é o nome.

## Detalhes técnicos

- `src/lib/conciliacao/counterparty.ts`: nova função `nameFromDescription` + encadeamento no `extractCounterparty`; testes unitários (Pix enviado/recebido, boleto, descrição genérica).
- `src/pages/ConciliacaoPluggy.tsx`: `createContactFromStatement` deixa de usar o fallback `Contraparte ${document}`; sem nome, abre um pequeno diálogo para digitar o nome antes de salvar.
- Limpeza dos 3 contatos legados por atualização de dados (nome derivado das descrições dos lançamentos com o mesmo documento), sem alterar vínculos ou lançamentos.

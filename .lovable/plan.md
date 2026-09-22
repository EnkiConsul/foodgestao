# Comprovante de pagamento: voltar a aparecer e pedir a data ao anexar

## O que está acontecendo

O comprovante que a Silvia anexou para a Hanna existe: é a imagem `IMG-20260915-WA0020.jpg`, anexada em 17/09 no Contracheque de agosto/2026 dela.

A tela de detalhes do documento pede ao banco um campo que não existe mais (nome antigo de "documento substituído"). Com isso a consulta inteira falha em silêncio, e o bloco do comprovante fica como "Sem comprovante" — junto com os dados de importação (quem importou, nome do arquivo), que também aparecem vazios. Não é falta de permissão nem arquivo perdido.

## O que será feito

1. **Corrigir a consulta dos detalhes do documento**
   - Usar o nome correto do campo, para o bloco voltar a mostrar o comprovante anexado, com "Anexado", nome do arquivo, data do pagamento (quando informada), além de Ver, Baixar, Substituir e Remover.
   - Se a consulta falhar por qualquer outro motivo, mostrar um aviso claro em vez de dar a impressão de que não há comprovante.

2. **Anexar comprovante passa a abrir um formulário**
   - Hoje o botão de comprovante da lista de documentos abre direto o seletor de arquivo, então ninguém descobre que pode informar a data do pagamento.
   - Passa a abrir uma janela "Anexar comprovante de pagamento" com: nome do documento e colaborador, campo **Data do pagamento** e o botão **Importar comprovante** (que escolhe o arquivo). Mesma janela para **Substituir** um comprovante já anexado.
   - A data não pode ser futura; o restante das regras atuais continua (PDF ou imagem, até 15 MB, só quem administra a empresa anexa).
   - Quando já existe comprovante, o botão da lista continua abrindo o comprovante para visualizar, com a opção de substituir.
   - No bloco dentro dos detalhes, o mesmo formulário é usado, para o comportamento ser idêntico nos dois lugares.

3. **Verificar o caso da Hanna** depois do ajuste: abrir o Contracheque de agosto dela e confirmar que o comprovante aparece e abre, no computador e no celular, e também no portal da colaboradora.

Nada será apagado e nenhum comprovante existente é alterado — só a forma de anexar e de exibir.

## Detalhes técnicos

- `src/components/dp/documentos/DocDetalhesDialog.tsx`: no `select` de `dp_documentos`, trocar `replaces_by_documento_id` por `replaced_by_documento_id` (a coluna real); propagar `error` da consulta (lançar) para o React Query mostrar estado de erro, e exibir mensagem no bloco quando `detalhes.isError`.
- `src/components/dp/documentos/ComprovantePagamentoPanel.tsx`: extrair um `ComprovanteAnexarDialog` (Dialog + `Label`/`Input type="date"` com `id`/`htmlFor`, `max` = hoje, botão Importar que dispara o `input[type=file]` oculto) e usá-lo tanto em `ComprovanteAcaoBotao` (substituindo o clique direto no seletor de arquivo) quanto no `ComprovantePagamentoPanel` (Importar e Substituir). Continua chamando `useDpComprovantePagamento().anexar.mutate({ alvo, file, pagoEm })` — sem mudança no hook nem no banco.
- Sem migration; sem alteração de RLS ou Storage.
- Testes: casos em `src/__tests__/comprovante-pagamento.test.ts` (ou arquivo novo em `src/test/unit/`) para validação da data (vazia aceita, futura recusada) e para o `select` de detalhes conter a coluna correta.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json` e `bunx vitest run`.
- Nada publicado.

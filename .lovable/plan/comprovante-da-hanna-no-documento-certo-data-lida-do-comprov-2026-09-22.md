# Comprovante da Hanna no documento certo + data lida do comprovante

## O que está errado hoje

Conferi os documentos da Hanna: o comprovante `IMG-20260915-WA0020.jpg` está ligado ao
**Adiantamento Salarial de 08/2026**, e não ao **Adiantamento Salarial de 09/2026**, que é o
pagamento a que ele se refere. Como o certificado de validação digital é montado a partir do
documento, o comprovante aparece anexado no certificado da competência errada. O campo de data
de pagamento desse comprovante está vazio.

## Fase 1 — Corrigir o vínculo

- Mover o comprovante para o Adiantamento Salarial de 09/2026 da Hanna, em uma única operação
  que só conclui se tudo der certo.
- O arquivo em si não é reenviado nem apagado: apenas passa a pertencer ao documento correto,
  com quem enviou e quando preservados.
- O Adiantamento de 08/2026 volta a ficar sem comprovante, e o certificado dele deixa de exibir
  o anexo.
- Registro em auditoria com o motivo da correção.

## Fase 2 — Evitar que se repita

- Ao anexar, o sistema compara a data do pagamento com a competência do documento e avisa quando
  não combinam ("O pagamento informado é de 09/2026 e o documento é de 08/2026"), pedindo
  confirmação antes de gravar.
- No certificado de validação, a página do anexo passa a mostrar sempre a competência do
  documento e a data do pagamento, para que a divergência fique visível.
- Certificado de competência sem comprovante não traz página de anexo.

## Fase 3 — Ler a data no próprio comprovante

- Na janela "Anexar comprovante", depois de escolher o arquivo o sistema tenta ler a data da
  transação no comprovante e sugere essa data no campo de pagamento.
- A sugestão aparece marcada como "Data lida do comprovante — confira", sempre editável: nada é
  gravado sem a conferência de quem está anexando.
- Se não conseguir ler, o campo continua em branco e o preenchimento é manual, como hoje.
- Para o comprovante da Hanna, a data será a lida no arquivo e confirmada por você na tela.

## Detalhes técnicos

- Correção de dados: bloco transacional movendo `comprovante_file_path`, `comprovante_file_name`,
  `comprovante_file_size`, `comprovante_mime_type`, `comprovante_uploaded_by` e
  `comprovante_uploaded_at` de `dp_documentos` 97fd9749 (adiantamento 2026-08-01) para 9d77a97d
  (adiantamento 2026-09-01), sem tocar no Storage, com contagens antes/depois.
- Conferência de competência dentro da rotina oficial de anexo (`anexarComprovante` /
  RPC do servidor), retornando aviso identificável para a tela — validação no backend, não só
  na interface.
- Edge Function `dp-documento-certificado`: separador do anexo passa a imprimir competência do
  documento + data do pagamento; nada é anexado quando o documento não tem comprovante.
- Leitura da data: extração no cliente por OCR da imagem/PDF em `src/lib/dp/comprovante-data.ts`
  (nova função de sugestão), reaproveitando a validação de data já existente; sugestão nunca
  substitui a confirmação do usuário.
- Testes: vínculo correto após a correção, aviso de competência divergente, certificado sem
  anexo quando não há comprovante e sugestão de data (lida, ilegível e inválida).
- Nada é publicado e nenhuma migração de estrutura é aplicada sem sua autorização.

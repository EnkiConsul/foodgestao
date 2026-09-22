# Comprovante de pagamento da Hanna: mover para o adiantamento correto

## O que a conferência no banco mostrou

A Hanna tem 12 documentos. Apenas **um** tem comprovante anexado:

- **Contracheque Mensal — competência 08/2026** (anexado em 17/09, arquivo `IMG-20260915-WA0020.jpg`, sem data de pagamento informada).

As imagens confirmam que o documento aberto é o **Adiantamento Salarial de 08/2026**, mas o arquivo da Silvia foi vinculado por engano ao **Contracheque de 08/2026**. Por isso o adiantamento aparece como "Sem comprovante".

## O que vai ser feito

1. **Mover o comprovante para o documento correto**
   - Transferir `IMG-20260915-WA0020.jpg` do Contracheque de 08/2026 para o Adiantamento Salarial de 08/2026.
   - Fazer a transferência em uma única operação protegida: só concluir se o comprovante ainda estiver na origem e o destino continuar vazio.
   - Preservar arquivo, responsável e data do envio; manter a data de pagamento vazia, pois ela não foi informada.
   - Registrar no histórico a correção da vinculação, com origem, destino, autor e horário.

2. **Evitar nova vinculação ao documento errado**
   - No formulário de anexo, destacar colaborador, tipo e competência do documento antes da escolha do arquivo.
   - Manter o campo visível para informar a data do pagamento e o botão “Importar comprovante”.

3. **Conferir no celular**
   - Validar que o Adiantamento Salarial de 08/2026 passa a mostrar “Anexado”.
   - Abrir e baixar o comprovante dentro da própria tela no acesso do gestor e no portal da Hanna.
   - Confirmar que o Contracheque de 08/2026 passa a mostrar “Sem comprovante”.

4. **Segurança da correção**
   - Não apagar nem reenviar o arquivo físico; alterar somente o vínculo entre os dois documentos.
   - Se qualquer condição tiver mudado antes da execução, interromper sem alteração parcial e revisar novamente.

## Observação sobre a data de pagamento

O comprovante está sem a data do pagamento. A transferência preservará esse estado; nenhuma data será inventada.

## Detalhes técnicos

- Origem: documento `176947a2-445b-405b-92f6-53b1a806cd4f` (Contracheque 08/2026).
- Destino: documento `97fd9749-9fa7-406a-ab63-d5abd5e37422` (Adiantamento 08/2026).
- Transferência transacional e condicionada, seguida de leitura de conferência.
- Ajuste apenas na apresentação do formulário para deixar o documento-alvo inequívoco.
- Sem migrations, sem mudança de RLS e sem publicação.

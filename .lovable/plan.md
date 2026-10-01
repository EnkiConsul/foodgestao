# Melhorias de Recibos no Pessoas 360°

## Objetivo
Concluir a integração jurídica e operacional dos recibos e transformar a lista atual em um histórico detalhado, consistente no computador e no celular.

## O que será entregue
1. **Assinaturas sincronizadas**
   - Assinatura pelo link do WhatsApp também registrará o aceite do documento vinculado, liberando o certificado.
   - Assinatura pelo Portal atualizará o recibo correspondente para “Assinado”.
   - Operações serão idempotentes: repetir a confirmação não duplicará evidências.

2. **Quitação completa no acervo**
   - Data do pagamento, modalidade e valores bancário/em espécie serão gravados no documento vinculado.
   - Histórico e certificado passarão a exibir esses dados sem depender de um comprovante bancário separado.

3. **Cancelamento consistente**
   - Cancelar um recibo arquivará o documento vinculado na mesma operação.
   - O link público será invalidado e a pendência mensal será recalculada e reaberta quando aplicável.
   - Recibos assinados continuarão protegidos contra cancelamento.

4. **Histórico detalhado de recibos**
   - Cada linha/card será clicável e abrirá uma ficha com beneficiário, natureza, competência, descrição, valores, forma e data do pagamento, canal e trilha da assinatura.
   - A ficha terá ações compatíveis com o estado: baixar PDF, enviar/copiar link, abrir certificado e cancelar.
   - No celular, o detalhamento usará o padrão de painel inferior; no computador, diálogo centralizado.

5. **Usabilidade complementar**
   - Ao chegar por uma pendência, a confirmação oferecerá retorno direto às pendências.
   - Recibos de diária, teste e outros pagamentos terão identificação clara como “Recibo de Pagamento” no Portal.

## Detalhes técnicos
- Criar uma migração reversível com rotinas transacionais para aceitar e cancelar recibos, mantendo menor privilégio e validação no servidor.
- Não conceder gravação direta da tabela de recibos ao navegador.
- Atualizar as funções de emissão, assinatura pública e aceite do portal para usar as novas rotinas.
- Atualizar a tela de recibos e a classificação visual no Portal.
- Cobrir sincronização, idempotência, cancelamento, reabertura de pendência e apresentação com testes direcionados.
- Aplicar a migração no Lovable Cloud e implantar somente as funções do servidor alteradas; a interface não será publicada sem pedido explícito.

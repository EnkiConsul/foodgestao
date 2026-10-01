# Melhorias de Recibos no Pessoas 360°

## Objetivo
Concluir a integração jurídica e operacional dos recibos e transformar a lista atual em um histórico detalhado, consistente no computador e no celular.

## O que será entregue
1. **Assinaturas sincronizadas**
   - Colaborador cadastrado terá somente **Portal do Colaborador** ou **Assinar à Mão**; a opção de link por WhatsApp será removida desse caso.
   - Pessoa sem cadastro terá somente **Link pelo WhatsApp** ou **Assinar à Mão**.
   - Assinatura pelo Portal atualizará o recibo correspondente para “Assinado” e liberará o certificado do documento.
   - Assinatura pelo WhatsApp continuará restrita ao recibo avulso, com confirmação do CPF e trilha de auditoria própria.
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
   - A ficha terá ações compatíveis com o estado e o beneficiário: baixar PDF, enviar/copiar link apenas para pessoa sem cadastro, abrir certificado para colaborador e cancelar.
   - No celular, o detalhamento usará o padrão de painel inferior; no computador, diálogo centralizado.

5. **Usabilidade complementar**
   - Ao chegar por uma pendência, a confirmação oferecerá retorno direto às pendências.
   - Recibos de diária, teste e outros pagamentos terão identificação clara como “Recibo de Pagamento” no Portal.

## Detalhes técnicos
- Criar uma migração reversível com rotinas transacionais para aceitar e cancelar recibos, mantendo menor privilégio e validação no servidor.
- Não conceder gravação direta da tabela de recibos ao navegador.
- Validar os canais também no servidor: colaborador cadastrado não poderá receber link externo; pessoa sem cadastro não poderá usar o portal.
- Atualizar as funções de emissão, assinatura pública e aceite do portal para usar as novas rotinas.
- Atualizar a tela de recibos e a classificação visual no Portal.
- Cobrir sincronização, idempotência, cancelamento, reabertura de pendência e apresentação com testes direcionados.
- Aplicar a migração no Lovable Cloud e implantar somente as funções do servidor alteradas; a interface não será publicada sem pedido explícito.

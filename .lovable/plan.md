# Ressalvas no histórico, aprovação real de documentos e atraso grave

## 1. Ressalvas do desligamento nunca são apagadas

Hoje, ao reintegrar/recontratar alguém, as ressalvas guardadas são excluídas. Passa a funcionar assim:

- Cada desligamento guarda o seu próprio registro de ressalvas (observação + "recontrataria"), com a data do desligamento.
- Reintegrar/recontratar apenas encerra o registro anterior; nada é apagado.
- Um novo desligamento cria um novo registro, sem sobrescrever os antigos.
- Na tela de desligamento e na ficha, o RH vê as ressalvas do desligamento atual e, abaixo, o histórico dos desligamentos anteriores (somente leitura, com data).
- Tudo segue invisível para o colaborador: mesma área restrita a dono, administrador e RH.

## 2. Confirmação do documento passa a ser aprovação de verdade

- Sai o aviso "Isso não confirma valores nem pagamento" (na tela e no aviso de sucesso).
- O botão passa a ser "Aprovar documento" e o texto explica que o colaborador conferiu e aprova o conteúdo do documento.
- Continua registrando data, hora e dispositivo para comprovação.
- Onde o documento já foi aprovado, o selo passa a ser "Aprovado por você" em vez de "Confirmado".

## 3. Documento sem aprovação vira pendência com atraso grave em 3 dias

- Todo documento enviado pela empresa que exige aprovação e ainda não foi aprovado aparece nas pendências do colaborador, um item por documento (com o título e a competência).
- Prazo: 3 dias corridos a partir do envio do documento.
- Passado o prazo, o item é marcado como **Atraso grave** (destaque vermelho) e sobe para o topo da lista, com a contagem de dias.
- O contador do card considera esses itens; o mesmo critério de 3 dias vale para o alerta que o RH já enxerga sobre documentos aguardando aprovação.

## Detalhes técnicos

- Banco: `dp_colaborador_desligamento_restrito` deixa de ser um registro por colaborador — passa a ter `data_desligamento` e `encerrado_em`, com índice único por colaborador + ciclo aberto. `dp_colaborador_desligamento_guard` para de deletar na reativação e apenas preenche `encerrado_em`; `dp_set_desligamento_ressalvas` grava/atualiza somente o ciclo aberto. RLS e permissões atuais são mantidas.
- Front: `useDpDesligamentoRessalvas` retorna o ciclo atual + histórico; `ColaboradorDesligamentoPanel` e `ColaboradorFichaDialog` exibem o histórico.
- Textos: remover `DOCUMENTO_CONFIRMACAO_TEXTO` antigo em `src/lib/dp/documento-titulo.ts` e ajustar `DpMeuDocumentos.tsx`.
- Pendências: em `useDpPendenciasColaborador`, novo bloco lendo `dp_documentos` (`exige_aceite = true`, sem aceite, não enviados pelo colaborador) com vencimento `created_at + 3 dias`; `MinhasPendenciasCard` ganha o rótulo "Atraso grave" quando `atrasoDias > 0` nesse tipo.
- Testes: casos de vencimento/atraso do documento e de preservação do histórico de ressalvas.

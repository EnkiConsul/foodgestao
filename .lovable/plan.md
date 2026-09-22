# Folga da Hanna: como testar e o que fazer com os pedidos aprovados sem folga

Você está certo: 20/09 já passou, então essa data não serve de teste. E de fato a folga de 20/09 nunca foi registrada no sistema — o pedido dela está como aprovado, sem folga no dia. A mesma falha aparece em outros 9 pedidos aprovados.

## O que existe hoje (verificado no banco)

Pedidos de folga aprovados que nunca geraram folga:

- CRISTIANE — 26/09 (**ainda vai acontecer**)
- HANNA — 20/09 (passou; ela folgou de fato)
- THAIS — 13/09, SARA — 12/09, ROSÂNGELA — 06/09 (passaram)
- RAFAEL — 02/07, 07/07, 08/07, 09/07, 10/07 (passaram)

O botão novo "Mudar o dia da minha folga" já está no portal e funciona para datas futuras.

## Como testar sem depender de setembro

1. Hanna tem folga registrada em **31/10 (sábado)**. Dá para testar a mudança dela para um domingo de outubro e, se quiser, voltar para 31/10 depois — as duas operações são reversíveis e ficam registradas.
2. Teste também o caminho "Pedir mudança ao DP": basta escolher um dia que esteja lotado ou bloqueado; o pedido cai na fila do setor de pessoal.

## Correção dos pedidos aprovados

1. **Cristiane, 26/09 (sábado que vem)** — é o caso urgente: o pedido está aprovado, mas ninguém vê a folga no calendário nem na operação do dia. Proposta: registrar a folga de 26/09 a partir do pedido já aprovado, mantendo o histórico e sem mexer no limite do dia (se o dia estiver lotado, eu aviso em vez de forçar).
2. **Os 9 pedidos passados** — escolha sua, e eu não mexo em nada antes de você decidir:
   - registrar as folgas retroativamente (histórico passa a refletir o que aconteceu de verdade, inclusive o dia 20/09 da Hanna); ou
   - deixar como está e apenas marcar esses pedidos com a observação de que não geraram folga, para não parecer erro futuro.
3. A causa já está corrigida na aprovação: novos pedidos aprovados criam a folga na mesma operação. O que falta é só o passivo acima.

## Detalhes técnicos

- Já corrigido: `dp_solicitacao_responder` cria a folga na mesma transação da aprovação (idempotente por colaborador + data), e `dp_folga_remarcar` / `dp_folga_remarcar_solicitar` atendem a mudança de dia pelo portal.
- Regularização: `INSERT` em `dp_folgas` (tipo `normal`, origem `solicitacao`, observação citando o pedido de origem) por pedido escolhido, via script de dados com `ON CONFLICT DO NOTHING`, respeitando o índice único `dp_folgas_unique_ativa`. Sem DDL.
- Para os passados, se você preferir não registrar, a alternativa é só um `UPDATE` de `resposta`/observação nos 9 pedidos, sem tocar em `dp_folgas`.
- Nada é executado sem sua autorização explícita, e nada é publicado.

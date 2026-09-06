# Corrigir trocas com a mesma data

## O que está acontecendo

Não é um erro de exibição: no banco, as quatro trocas registradas têm a **mesma data nos dois lados** (por exemplo 02/07/2026 trocada por 02/07/2026), e uma delas tem a mesma pessoa como solicitante e como colega. A tela está mostrando corretamente o que foi gravado.

A origem é o pedido de troca feito pelo calendário do portal: ali o colaborador escolhe "a folga que você oferece" numa lista que inclui **o próprio dia que ele está pedindo**, e nada impede confirmar. O pedido de troca feito pela tela "Minhas trocas" já bloqueia datas iguais — o calendário não.

## O que será feito

1. **Impedir na origem (calendário do portal)**
   - A lista "folga que você oferece" deixa de mostrar o dia que está sendo pedido.
   - Se não sobrar nenhuma folga para oferecer, o botão de trocar não aparece e o colaborador vê o aviso do motivo.
   - Antes de enviar, o sistema recusa datas iguais e recusa troca consigo mesmo, com mensagem clara.

2. **Trava no banco**
   - Nova regra que rejeita qualquer troca com data igual nos dois lados ou com solicitante igual ao colega, para nenhuma outra tela poder gravar isso de novo.

3. **Histórico existente**
   - Os quatro registros antigos (todos já expirados ou cancelados) ficam marcados como inválidos e passam a aparecer no histórico com o aviso "registro inconsistente (mesma data)" em vez de sugerir uma troca que nunca fez sentido.

4. **Verificação**
   - Testes automáticos cobrindo: lista sem o dia pedido, recusa de data igual, recusa de troca consigo mesmo.

## Detalhes técnicos

- `src/pages/dp/portal/DpMeuCalendario.tsx`: filtrar `minhasFolgasFuturas` excluindo `tradeOpen.iso` (lista do Select e cálculo de `canTrade`); validar em `solicitarTroca` que `tradeMyDate !== tradeOpen.iso` e `tradeOpen.occupantId !== meRef.data.id`.
- Migração nova (após a última existente): `ALTER TABLE public.dp_trocas ADD CONSTRAINT dp_trocas_datas_distintas CHECK (data_original <> data_proposta)` e `dp_trocas_pessoas_distintas CHECK (solicitante_id <> destino_id)`, com `UPDATE` prévio marcando as 4 linhas legadas (sufixo no `motivo`, ex.: `[registro inconsistente]`) — as travas ficam `NOT VALID` se necessário para não falhar no legado.
- `src/components/dp/TrocaCard.tsx` / `TrocaDetalheDialog.tsx`: quando `data_original === data_proposta`, exibir aviso de registro inconsistente em vez do par de datas.
- Testes em `src/test/unit/` para o filtro de folgas ofertáveis e as validações.

Fora do escopo: mudar o fluxo de aprovação de trocas, notificações e regras de folga.

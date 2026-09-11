# Rescisão da Cristiane, rescisão do Wanderson e urgência das férias

## O que está acontecendo

Confirmei nos dados da Pakerê:

- Cristiane (desligada 27/08) e Wanderson (desligado 01/08) estão os dois sem rescisão importada na competência 2026-08.
- Como os dois são os únicos que devem rescisão nesse mês, o sistema juntou tudo em **um único card de "lote da unidade"**: "Rescisão não importada — PAKERÊ GARAVELO — 2026-08". É esse card sem nome que aparece na sua tela.
- Por isso a Cristiane não aparece com nome e o card individual do Wanderson desapareceu. Além disso, o prazo mostrado (06/09) é o da Cristiane; o prazo real do Wanderson era 11/08, ou seja, 31 dias de atraso que ficaram escondidos.
- Erildson: o período 2024/2025 vence em 30/09/2026 (19 dias). O sistema já mostra "Férias a conceder — risco de dobra", mas ordena tudo por dias de atraso, então ele cai no fim da lista, depois de pendências antigas menos graves.

## O que vai mudar

### 1. Rescisão sempre por pessoa

Rescisão deixa de ser agrupada por unidade. Cada pessoa desligada gera o seu próprio card, com nome e com o prazo de 10 dias contado do desligamento dela. Assim voltam a aparecer, separadamente:

- Cristiane — prazo 06/09
- Wanderson — prazo 11/08, com o atraso real

O agrupamento em lote continua valendo para contracheque, adiantamento e folha de ponto, onde faz sentido ("faltou de todos").

### 2. Férias com risco de dobra sobem para o topo

Período com risco de dobra (prazo legal a 30 dias ou menos) passa a ser tratado como urgente:

- ganha destaque vermelho e o selo "Urgente — risco de dobra";
- é ordenado logo depois das pendências já atrasadas, antes de qualquer outra coisa "a vencer";
- entra na contagem de itens que pedem ação agora, junto com os atrasados.

Erildson passa a aparecer no topo com "faltam 19 dia(s) para o prazo legal".

## Detalhes técnicos

- Banco: migração para `private.dp_refresh_document_pending` — a condição de lote (`total_elegiveis > 1 AND total_faltantes = total_elegiveis`) passa a exigir `doc_tipo <> 'rescisao'` em todas as colunas onde é usada (`pendencia_id`, `subtitulo`, `colaborador_nome`, `colaborador_id`, `escopo`, `pessoas`, `total_elegiveis` e no `row_number`). Nada mais da apuração muda; o `DELETE`/`INSERT` já reescreve as linhas.
- Após a migração, apurar de novo (`dp-refresh-pendencias`) para a Pakerê, para que os cards novos apareçam sem esperar as 03:00.
- Front: em `src/hooks/useDpPendencias.tsx`, o item de pendência ganha `urgente?: boolean`; o bloco de férias marca `urgente` quando `alertaPendenciaFerias` devolve nível `atencao` (ou `vencido`, que já é atraso). A ordenação passa a ser: atrasados (por atraso), urgentes, depois o resto por vencimento/nome.
- `PendenciasCard.tsx` e a tela `/dp/cadastros/pendencias` mostram o selo vermelho "Urgente" para `urgente` e somam esses itens no contador de ação imediata; o cache local de pendências continua funcionando (campo novo é opcional).
- Testes: caso de apuração garantindo rescisão individual por pessoa (dois desligados no mesmo mês) e teste de ordenação colocando férias em risco de dobra acima de itens futuros.

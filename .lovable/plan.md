## Causa

Hoje o painel "Próximas Datas Bloqueadas" (`/dp/bloqueios`) lista literalmente as linhas da tabela `dp_datas_bloqueadas`. As datas de "Bloqueio Pós-Pagamento (FDS após dia 5)" que aparecem lá foram **pré-geradas** em maio/junho e ficaram gravadas com `regra_id = null`. Editar a regra não mexe nessas linhas — o motor em runtime já reflete a mudança no calendário, mas a lista continua estática.

## Correção

Recompor a seção "Próximas Datas Bloqueadas" a partir da mesma fonte de verdade do calendário: as **regras expandidas em runtime** + overrides + manuais reais.

### Mudanças em `src/pages/dp/DpBloqueios.tsx`

1. Passar a carregar também `dp_bloqueio_regra_unidades` (já é carregado em `regrasQ`, reaproveitar) e computar via `buildBloqueiosDeRegras` (de `src/lib/dp/bloqueio-rules.ts`) a expansão para o intervalo filtrado (ano + mês + unidade + showPast).
2. Construir a lista final unindo três origens, deduplicando por `data + unidade_id`:
   - **Auto (regra)**: cada ISO produzido pela expansão. Motivo = nome da regra. `regra_id` = id da regra. Sem linha física em `dp_datas_bloqueadas`.
   - **Liberada**: linha real de `dp_datas_bloqueadas` com `liberada = true` (ou `liberada_por_solicitacao`) — sobrepõe o Auto correspondente para a mesma data/unidade.
   - **Manual**: linha real com `liberada = false` que **não** corresponda a nenhuma expansão de regra (verdadeiros bloqueios manuais).
3. Ignorar/ocultar as linhas legadas pré-geradas (aquelas cujo `data+unidade` já está coberto por uma regra) — deixam de aparecer duplicadas. Elas continuam no banco sem efeito colateral, já que o motor em runtime não as consulta.
4. Ajustar `DataRow`/handlers:
   - Auto sem linha física: botão "Editar/Excluir" continua oculto (já é o comportamento hoje). Botão "Liberar Data" (novo, análogo ao do calendário) permite criar override — usa upsert em `dp_datas_bloqueadas` com `{liberada: true, motivo: 'Liberado manualmente pelo administrador'}`.
   - Auto liberada → botão "Bloquear Novamente" (já existe) apaga o override; a regra volta a valer.
   - Manual → editar/excluir atuais.
   - Manual liberada → "Bloquear Novamente" reseta `liberada=false` (já existe).

### Sem migração

O motor em runtime já cobre a geração. Não regeramos linhas físicas. Linhas legadas ficam intactas (podem ser limpadas depois se o usuário pedir).

## Verificação

- Editar "Bloqueio Pós-Pagamento" alterando `pos_pagamento_dia` de 5 → 10 e salvar.
- "Próximas Datas Bloqueadas" recarrega mostrando os sábados/domingos após o dia 10, e as datas antigas (após dia 5) somem.
- Datas liberadas manualmente continuam marcadas "Liberada" com botão "Bloquear Novamente".
- Bloqueios manuais permanecem editáveis/removíveis.

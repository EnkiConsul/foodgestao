## Fase 12 — Ativação gradual: dispensada

Nenhuma alteração será feita.

### Situação atual (confirmada nas fases anteriores)
- Todas as conexões V1 foram apagadas.
- `PLUGGY_V1_FROZEN=true` bloqueia qualquer escrita no stack legado.
- O fluxo de conexão em `OpenFinanceWizard` já usa exclusivamente a V2.

### Por que não implementar agora
Rollout por coortes e kill switch fazem sentido quando há tráfego real em duas versões convivendo. Como só o stack V2 está ativo e sem base instalada para migrar, a Fase 12 não agrega nada operacional neste momento.

### Quando reabrir
- Se surgir necessidade de expor uma nova versão do wizard/motor V2 em paralelo.
- Se decidirmos oferecer um "beta" de novos provedores antes de liberar para toda a base.

### Próximo passo sugerido
Seguir para a **Fase 13** do plano de reconstrução Pluggy V2 quando quiser.
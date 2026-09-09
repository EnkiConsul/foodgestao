# Roadmap — Pessoas 360° (plano aprovado 09/2026)

## Feito
- [x] Migração: `dp_intermitente_competencia_confirmacoes`, `dp_adiantamento_solicitacoes`, `dp_pendencias_decisoes` (RLS, triggers, backfill de optantes)
- [x] `src/lib/dp/adiantamento-opcao.ts` — efeito por competência, última solicitação válida, regra dos 5 dias no portal
- [x] `src/hooks/useDpAdiantamentoSolicitacoes.tsx` — listar/registrar (gestor e portal) + notificação ao gestor
- [x] `src/hooks/useDpPendenciasDecisoes.tsx` — ignorar (justificativa) / adiar compartilhados
- [x] `pendencias-documentos.ts` — `optanteNaCompetencia`, `intermitenteSemRegistros`/`intermitenteTrabalho`
- [x] `useDpPendencias.tsx` — adiantamento por histórico; alerta "Confirmar trabalho de intermitente"; férias adquiridas/a vencer/vencidas (exceto sócio e desligado)
- [x] Alerta do intermitente respondido na UI ("Trabalhou"/"Não trabalhou") via `PendenciaAcoes` + `useDpIntermitenteConfirmacoes`
- [x] Ignorar/adiar ligados em `PendenciasCard` e `DpCadastroPendenciasLista`
- [x] `DocConsistenciaPanel.tsx` — sem bloco de férias; adiantamento por histórico; intermitente sem ponto não gera cobrança
- [x] `ColaboradorFormDialog.tsx` — histórico de solicitações datadas (gestor pode retroativo)
- [x] Portal: solicitação de ativar/cancelar adiantamento em `DpMeuSolicitacoes` (hoje/futuro, 5 dias de antecedência)
- [x] Testes de `adiantamento-opcao` + typecheck e suíte DP

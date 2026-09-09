# Roadmap — Pessoas 360° (plano aprovado 09/2026)

## Feito
- [x] Migração: `dp_intermitente_competencia_confirmacoes`, `dp_adiantamento_solicitacoes`, `dp_pendencias_decisoes` (RLS, triggers, backfill de optantes)
- [x] `src/lib/dp/adiantamento-opcao.ts` — efeito por competência, última solicitação válida, regra dos 5 dias no portal
- [x] `src/hooks/useDpAdiantamentoSolicitacoes.tsx` — listar/registrar (gestor e portal) + notificação ao gestor
- [x] `src/hooks/useDpPendenciasDecisoes.tsx` — ignorar (justificativa) / adiar compartilhados
- [x] `pendencias-documentos.ts` — `optanteNaCompetencia`, `intermitenteSemRegistros`/`intermitenteTrabalho`
- [x] `useDpPendencias.tsx` — adiantamento por histórico; alerta "Confirmar trabalho de intermitente"; férias adquiridas/a vencer/vencidas (exceto sócio e desligado)

## Pendente
- [ ] Responder o alerta do intermitente na UI (botões "Trabalhou"/"Não trabalhou" em PendenciasCard e DpCadastroPendenciasLista, upsert em `dp_intermitente_competencia_confirmacoes`)
- [ ] Ligar decisões (ignorar/adiar) em PendenciasCard e DpCadastroPendenciasLista (filtrar ignoradas, mesclar adiadas)
- [ ] `DocConsistenciaPanel.tsx` — remover bloco de férias; adiantamento por histórico; respeitar intermitente
- [ ] `ColaboradorFormDialog.tsx` — substituir chave de adiantamento por solicitações datadas (gestor pode retroativo)
- [ ] Portal (`src/pages/dp/portal`) — colaborador pede ativa/cancela adiantamento (hoje/futuro, 5 dias de antecedência)
- [ ] Testes: adiantamento-opcao, intermitente, decisões
- [ ] Typecheck + suíte DP

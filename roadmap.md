# Roadmap — Remover telas em desenvolvimento

Plano aprovado: `.lovable/plan/remover-as-telas-em-desenvolvimento-sesmt-ponto-folha-rescis-2026-09-14.md`

- [x] Apagar páginas, hooks, componentes e bibliotecas de SESMT, Ponto, Folha e Rescisões
- [x] Rotas antigas redirecionam para o início de Pessoas 360°
- [x] Item SESMT fora do menu e da busca
- [x] Pendências sem avisos de ponto, ASO, EPI e treinamento
- [x] Cálculo dos vales sem marcações de ponto
- [x] Painel de consistência de documentos sem marcações de ponto
- [x] Banco: tabelas, funções, gatilhos e listas de opções apagados; lista de telas ocultas zerada
- [x] Tipos e testes validados

## Auditoria Open Finance / Conciliação (2026-09-16)
- [ ] F1 Permissão/escopo nas RPCs de conciliação + políticas de staging
- [ ] F2 Lock/idempotência nas confirmações
- [ ] F3 Resultado estruturado em ConciliacaoPluggy
- [ ] F4 Sync/cron: contadores e status reais
- [ ] F5 Webhook/revogação/extrato
- [ ] Testes focados (autorização, concorrência, rateio, falha parcial)
- [ ] 3 registros confirmed sem matched_transaction_id: preservados para revisão (não alterar)

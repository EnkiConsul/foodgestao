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

## Pré-Admissão pelo Candidato (fase em execução)
- [x] Banco: tabelas de pré-admissão, convite, pessoas relacionadas, documentos, eventos + RLS/grants
- [x] Edge Functions: convite, ficha pública do candidato, arquivo, gestor/transições (implantadas)
- [x] Regras: bloqueio menor + após 22h (sem override), checklist por cargo/unidade, dependentes ≤5/6-14/≤14, Sesc
- [x] Efetivação somente após conferir ficha oficial da contabilidade (atômica/idempotente)
- [x] Testes de backend (32) + Deno check + typecheck + relatório docs/preadmissao-relatorio.md
- [x] Frontend gestor: 3ª opção em Colaboradores, aba Pré-Admissões, revisão, pacote para contabilidade
- [x] Frontend candidato: página pública em etapas, mobile-first
- [x] Pendência canônica no useDpPendencias (notificação no sino pendente)
- [ ] Conferência com Importar Ficha, duplicidade de CPF na tela, QA desktop/mobile

- [x] Pré-Admissão — incremento 2: correções da revisão do commit f276cab (fases, payload, atomicidade, MIME real, grants, menor+22h, ficha oficial conferida)
- [x] Pré-Admissão — incremento 4: telas do gestor (lista, convite, revisão), página pública do candidato e pendências
- [x] Pré-Admissão — incremento 5: concorrência (versão da ficha, gravação de familiares na mesma transação travada, payload da raiz/familiares recusado)
- [x] Pré-Admissão — incremento 3: integridade composta, cliente somente leitura, promoção atômica com CPF/ficha conferida, documentos com titular/finalidade e vínculo por admissão
- [x] Pré-Admissão — incremento 6: recontratação no caminho de conclusão (validação antes de mutar, item vinculado, dados pessoais/administrativos preservados, teste do caminho feliz)
- [ ] Pré-Admissão — teste de concorrência simultânea da efetivação com ficha (duas sessões)

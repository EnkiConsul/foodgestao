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
- [x] Pendência canônica no useDpPendencias + aviso no sino ao enviar a ficha
- [x] Conferência com Importar Ficha, duplicidade de CPF na tela, QA desktop/mobile

- [x] Pré-Admissão — incremento 2: correções da revisão do commit f276cab (fases, payload, atomicidade, MIME real, grants, menor+22h, ficha oficial conferida)
- [x] Pré-Admissão — incremento 4: telas do gestor (lista, convite, revisão), página pública do candidato e pendências
- [x] Pré-Admissão — incremento 5: concorrência (versão da ficha, gravação de familiares na mesma transação travada, payload da raiz/familiares recusado)
- [x] Pré-Admissão — incremento 3: integridade composta, cliente somente leitura, promoção atômica com CPF/ficha conferida, documentos com titular/finalidade e vínculo por admissão
- [x] Pré-Admissão — incremento 6: recontratação no caminho de conclusão (validação antes de mutar, item vinculado, dados pessoais/administrativos preservados, teste do caminho feliz)
- [ ] Pré-Admissão — teste de concorrência simultânea da efetivação com ficha (duas sessões)
- [x] Pré-Admissão — incremento 7: preparar só em revisão, requisitos recalculados, admin validado, anexar ≠ conferir, candidato revê arquivos, pacote da contabilidade, aviso de CPF, QA 3 resoluções
- [x] Pré-Admissão — incremento 8: conferência da ficha contra o staging revisado, divergências com escolha explícita, caminho Somente Anexar, auditoria das policies de Storage
- [x] Pré-Admissão — incremento 9: revisão do commit d5c25a6 (atomicidade dos familiares, versão na chamada real, análise de documento atômica, avô/avó no Sesc)
- [ ] Pré-Admissão — testes automatizados de integração das telas
- [ ] Pré-Admissão — teste ponta a ponta com convite sintético e sessão de gestor (formulário, upload, retomada, correção, contabilidade, importação)
- [ ] Pré-Admissão — teste de Storage com sessões reais A/B/sem permissão (download/list/write)
- [x] Pré-Admissão — incremento 10: revisão do commit c42f576 (Somente Anexar sem cadastro, comparação das informações administrativas, pacote legível sem código interno, status encerrados, ficha oficial atômica, requisitos por cargo/unidade configuráveis, logs sanitizados)

## Endereço padronizado (2026-09-17)
- [x] Bloco único de endereço (CEP primeiro, busca automática, lista de estados, "Sem número") em Empresas, Unidades, cadastro inicial da empresa, perfil do colaborador e ficha do candidato
- [x] Endereço editável no cadastro do colaborador (aba Dados) e na conferência da ficha oficial
- [ ] Etapa B — validações da admissão: duas finalizações simultâneas, percurso completo com convite fictício, acesso a arquivos com pessoas diferentes
- Fora de escopo: módulo financeiro (Open Finance/conciliação) fica com o Rafael

## Regras de admissão, sexo e dados de pagamento (2026-09-18)
- Exceções por sexo, agrupamento por tema e separação entre documentos do candidato e da empresa na aba Regras.
- Equivalências de documentos: CNH vale como identidade com foto e atende o CPF; RG com CPF atende o CPF.
- Dados de pagamento (banco/agência/conta/tipo, titular, Pix e recebimento em espécie) no cadastro do colaborador e na ficha do candidato; envio da ficha exige conta OU Pix; cadastro incompleto passa a apontar a falta.
- Corrigida a falha que impedia salvar exceção por cargo (a checagem interna lia a coluna de unidade na tabela de cargos). Validado no navegador: CNH obrigatória para MOTOQUEIRO salva.
- Pendente: pendências automáticas de dados bancários para colaboradores antigos.

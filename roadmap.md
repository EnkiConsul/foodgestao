# Roadmap — Remover telas em desenvolvimento

## Comprovante da Hanna — Adiantamento 08/2026
- [x] Transferir o comprovante vinculado ao contracheque para o adiantamento, preservando arquivo e metadados
- [x] Registrar a correção no histórico sem apagar dados
- [x] Destacar colaborador, tipo e competência antes de importar um comprovante
- [x] Validar o resultado e a abertura no celular

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
- Pendências automáticas de dados bancários: item na lista do gestor e no portal, com bloco editável em Meu Cadastro (quem recebe em espécie não é cobrado).

## Excluir fichas de admissão (2026-09-17)
- Gestor (dono/administrador) exclui a ficha com confirmação e motivo opcional; concluídas ficam protegidas.
- Exclusão não destrutiva: `dp_preadmissoes.removido_em/por/motivo`, RPC `dp_preadmissao_excluir` transacional, convites revogados e evento `ficha_excluida` no histórico.
- Fichas removidas saem das listas, da revisão, das pendências, do link do candidato e do acesso aos arquivos.
- Validado no navegador: ficha sintética excluída (evento gravado, convite revogado, nada apagado).

## Certificado de validação e comprovante no celular (2026-09-17)
- Comprovante de pagamento e certificado abrem na própria tela (sem aba nova, que o celular bloqueia).
- Certificado virou PDF único do servidor (`dp-documento-certificado`): capa com dados da aprovação, documento assinado, comprovante como anexo (sem validação própria) e rodapé de lastro em todas as páginas.
- Testado com documento real aprovado (contracheque + comprovante Pix): 4 páginas, rodapé e anexo conferidos.

## Autorização do Open Finance — P0 (2026-09-18)
- Migrations aplicadas em produção: sync_runs somente leitura para o app; cancelamento de autorização exige dono/editor; helpers pluggy_can_edit/pluggy_user_can_edit recusam usuário bloqueado; policies restritivas "not_blocked" nas tabelas pluggy_*.
- Edge Functions deployadas: pluggy-sync-item (exige permissão de edição; conflito sem nomes de empresas sem acesso) e pluggy-pause-or-delete (empresa lida da conta, exige editor, só pausa conta desativada).
- Matriz testada em transação revertida: sem vínculo/empresa alheia/bloqueado negados; dono e service_role preservados.

## Autorização do Open Finance — P0 parte 2 (2026-09-18)
- [x] Revogadas escritas (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES, inclusive por coluna) de PUBLIC/anon/authenticated nas 8 tabelas Pluggy; SELECT e service_role preservados; policies de escrita do cliente removidas.
- [x] Novas RPCs: pluggy_clear_pending_staging, pluggy_clear_staging_suggestions, pluggy_set_staging_counterparties, pluggy_set_staging_description (transactions=edit), pluggy_review_credit_account (accounts=edit).
- [x] Permissão por módulo explícita nos helpers (private.pluggy_module_edit); cancelamento e endpoints de conexão/conta exigem accounts=edit.
- [x] Frontend migrado (ConciliacaoPluggy, PluggyCreditCardReviewDialog) — exige publish.

## CSP / cabeçalhos de segurança (S1) — 2026-09-18
- [x] Scripts inline próprios externalizados (public/scripts/gtag-init.js, meta-pixel.js); index.html sem script inline executável (teste garante).
- [x] Política fase 1 (Report-Only + frame-ancestors enforce) em src/lib/security/csp.ts, com allowlist inventariada.
- [x] Observação de violações sem coletor e sem dados sensíveis (src/lib/security/cspViolationLogger.ts).
- [x] Configuração pronta para proxy + verificação em docs/security/csp-cabecalhos.md.
- [ ] BLOQUEADO: hospedagem Lovable não envia cabeçalhos personalizados nem lê public/_headers. S1 só encerra com evidência de cabeçalho na resposta HTTP, aplicada na camada de proxy/domínio do proprietário.

## AUD-021 — Métricas de marketing (frontend)
- [x] Google Analytics e pixel da Meta desativados no aplicativo inteiro (sem SDK, sem fila, sem noscript/prefetch); `trackEvent` e visualizações de página são no-op.
- [ ] Reativar somente após isolar as páginas de marketing das rotas autenticadas e dos links com credencial — condições em `docs/security/metricas-marketing-desativadas.md`. BLOQUEADO por essa separação.
- [ ] Publicar a desativação (aguardando decisão do proprietário).

## S3 — Política de senhas (2026-09-19)
- [x] Regra única de senha nova: 12+ caracteres, quatro classes, até 72 bytes (recusa explícita, sem truncar), bloqueio de senhas comuns/padrões e de nome/e-mail/CPF — `src/lib/security/passwordPolicy.ts` espelhada em `supabase/functions/_shared/password-policy.ts`.
- [x] Aplicada em criar conta, redefinição por link, primeiro acesso, recuperação por código e portal do colaborador (subiu de 8 para 12); login legado de 6 preservado.
- [x] Medidor de força local em português (`src/components/auth/MedidorSenha.tsx`), sem biblioteca externa e sem enviar senha a terceiros.
- [x] Edges ajustadas: `dp-alterar-senha-colaborador` e `auth-recovery-reset`.
- [x] Bloqueio de senhas vazadas ativado na configuração gerenciada (resposta: configuração atualizada com sucesso).
- [x] Configuração gerenciada verificada pelo proprietário: mínimo 12 salvo e confirmado ao reabrir, senhas vazadas marcadas e quatro classes exigidas.
- [x] Revisão: sequência numérica também comparada na forma com dígitos, lista de senhas comuns normalizada, símbolo restrito ao conjunto ASCII do serviço, mensagem do limite em bytes, "fraca" genérica não descrita como vazamento e mensagem de senha nova em 12.
- [ ] Obrigar verificação em duas etapas (ex.: Open Finance) — item separado, exige implantação gradual.
- [ ] Publicar o frontend (aguardando decisão do proprietário).

- [x] Fase 1 Pessoas 360 — Documentos, versionamento e aceites (RPC dp_documento_aceitar, função dp-documento-aceitar, imutabilidade da versão aceita, SHA-256 real, certificado por versão)

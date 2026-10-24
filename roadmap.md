# Roadmap — Pré-admissão ativa na rotina da loja

- [ ] Corrigir auditoria: avisos de regras no calendário/Pix, isolamento de comprovantes incompatíveis no certificado, recuperação de versão com guarda de 30 segundos e revisão individual dos chamados antigos antes de encerrar. Sem publicar frontend nem alterar colaboradores.

- [x] Aplicar revisão da admissão: salvar sem bloqueio silencioso, separar pendências de finalização, permitir efetivação CLT com ciência expressa sem ficha retornada após ASO válido/envio confirmado, rolar ao ASO e mostrar etapas compactas. 26 testes passaram; fluxo autenticado no celular validou pendências, finalização, foco no ASO, ciência obrigatória e abertura de documentos por simulação; janela documental sem corte lateral. Build OK; sem gravações reais ou publicação.

- [x] Redesenhar conferência da admissão: PDF compacto + Salvar e Avançar/Finalizar, ASO retomável antes da contabilidade, elegibilidade de efetivação por vínculo e documentos oficiais após efetivar; ocultar alerta do próprio provisório e alinhar vigência inicial. 23 testes passaram; fluxo autenticado conferido no celular com gravações interceptadas (avanço e finalização simulados), sem alterar dados reais. Build OK.
- [ ] Disponibilizar o novo fluxo no site e a correção de CPF na função do gestor: aguarda autorização explícita de publicação. Gravação real, ASO real e efetivação real não exercitados para preservar os colaboradores.

- [x] Categorizar feriados em Nacional, Estadual, Municipal e Sindicato (CCT), com seletor, filtro, resumo, replicação e identificação nos calendários; migração aditiva 0141 preserva RPC antiga e registros. 45 testes passaram; consulta autenticada, formulário e resumo mensal conferidos em 320/407/1280 sem gravações de teste ou publicação. Legado não federal inicialmente Municipal, sujeito à revisão do gestor (ex.: Dia da Categoria SECHSEG).

- [x] Melhorar abas horizontais das unidades no celular, exibir totais somente no painel e padronizar Sexta-feira da Paixão; 36 testes passaram e navegação autenticada conferida em 320/407/1280, sem gravações reais ou publicação.

- [x] Facilitar a inclusão de Sexta-feira Santa junto aos nacionais mediante seleção local explícita; 24 testes passaram, janela conferida em 320/407/1280 e gravação/leitura simuladas com conta autenticada. Sem gravar feriados reais ou publicar.

- [x] Revisar a classificação legal dos feriados móveis: Sexta-feira Santa permanece local/opcional (Lei 9.093/1995, art. 2º), não adicionada aos nacionais; consulta de pendências inclui codigo_movel e teste de exceção por data alinhado. 66 testes passaram e build OK; sem publicação ou alteração de dados reais.

- [x] Cadastrar Carnaval, Corpus Christi e Sexta-feira Santa por nome, com cálculo anual automático na agenda e no servidor (0140); 28 testes passaram, cadastro/resolução/desativação validados em PostgreSQL isolado e seleção/prévias conferidas no celular e computador. Sem cadastro real ou publicação da interface; compatibilidade do serviço de desligamento atualizada.

- [x] Ajustar cadastro de unidades e todas as abas para celular; feriados ordenados por data com datas completas. 17 testes passaram; cinco abas e quatro janelas auxiliares conferidas em telas estreitas, sem rolagem lateral no conteúdo, alterações em dados reais ou publicação.

- [x] Adicionar filtro rápido “Folgas e trocas” em Ocorrências: 15 testes passaram; ativação/desativação e consulta autenticada validadas (nenhum registro vinculado no período); sem alterar registros reais nem publicar.

- [x] Justificativas automáticas de folgas extras, compensatórias e trocas: vinculadas à origem, sem impacto em assiduidade/férias, com tratativa externa pendente.
- [x] Corrigir cancelamento/exclusão e estorno dos dois participantes; separar evidência documental da ausência operacional; validar em PostgreSQL isolado sem alterar colaboradores reais.
- [ ] Publicação das justificativas e tela de Ocorrências: aguarda autorização explícita; aprovações anteriores não foram retroativamente alteradas.

- [x] Integrar folga extra, compensação de feriado e trocas às justificativas em Ocorrências: 96 testes passaram; leitura autenticada da tela validada, sem aprovação real ou publicação.

- [x] Corrigir Rotina da Loja: respeitar folgas e afastamentos aprovados, faltas confirmadas e trabalho por troca em todos os caminhos.
- [x] Validar sem alterar registros reais: 69 testes focados passaram; gestor autenticado abriu solicitações e rotina do dia 23/10 sem erro. Aprovação real e portal de colaborador não exercitados.
- [ ] Publicar correções autorizadas: bloqueada por falhas de regressão em authEmailConfirmation.test.tsx e calendario-rotina-p1.test.ts; não houve publicação.

- [x] Sugestão de horário: horário base mais repetido do cargo, uniforme em todos os dias, sem variação de sex/sáb/dom (`sugerirSemanaBaseCargo` + `montarSemanaUniforme`)
- [x] Nunca sugerir 7 dias trabalhados: folga semanal garantida (mais comum do cargo ou dia menos trabalhado)
- [x] Botão "Horário padrão do cargo" na aba Horário de Trabalho (corrige a ficha da Verônica)
- [x] RPC `dp_preadmissao_ativar_rotina`: cadastro provisório freelancer (CLT→mensalista, intermitente→diarista), exige cargo/unidade/jornada com folga
- [x] Efetivação converte o MESMO cadastro para o regime formal (sem duplicar), preservando histórico da rotina
- [x] Correções de banco: cast do enum regime_previsto, folgas dominicais (mínimo legal 1/mês), normalização de sexo
- [x] Selo "Aguardando registro" na lista de pré-admissões e na Rotina (com dias)
- [x] Provas no banco em transação desfeita: ativação, idempotência, conversão CLT — nada gravado em dados reais
- [x] Rótulo "Aguardando admissão" em todos os selos (lista, ficha e Operação do Dia)
- [x] Desistência da admissão: excluir a ficha ou cancelar o link encerra o cadastro provisório (inativa com data de saída, cancela folgas/solicitações/trocas futuras) preservando todo o histórico — migração 0128 + Edge dp-preadmissao-convite
- [x] Jornada nunca gravada vazia: rascunho envia o horário apurado dos dias; `consolidarJornada` deriva o horário principal, completa os dias e bloqueia o "Ficha salva" com mensagem clara se algum dia trabalhado ficar sem horário
- [x] Ativação na rotina sai da aba Documentos e passa a viver na aba Horário de Trabalho (`jornadaExtra` no modo admissão); Documentos fica 100% documental
- [x] Migração oficial 0134: `dp_preadmissao_ativar_rotina` consolida a jornada na ficha (`admin_dados.jornada`) na mesma transação da ativação — ficha e rotina nunca divergem
- [x] Ativação usa o horário da tela (sem exigir salvar a ficha antes) via `onJornadaChange`
- [x] Migração 0135: `dp_preadmissao_efetivar_com_ficha` converte o cadastro provisório da rotina em vez de acusar CPF duplicado
- [ ] Homologação visual pelo gestor na ficha da Verônica (aguarda uso real)
- [ ] Publicação desta leva (autorizada; aguarda resolução das falhas de regressão acima)
- [x] Teste `calendario-rotina-p1.test.ts` alinhado à prioridade já existente da exceção por data: limite 1 permanece 1 mesmo com três folgas fixas; nove testes deste arquivo passaram.
- [x] Assinatura do portal unificada: botão único "Visualizar e Assinar" (sem botão travado) abre tela cheia `DocumentoAssinarViewer`; PDF com várias páginas exige rubrica página a página antes de concluir (`src/lib/dp/rubrica.ts`). 13 testes novos/relacionados OK, suíte DP 1237 OK, build OK. Sem publicação e sem gravar dados reais.

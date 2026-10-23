# Roadmap — Pré-admissão ativa na rotina da loja

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
- [ ] Homologação visual pelo gestor na ficha da Verônica (aguarda uso real)
- [ ] Publicação desta leva (aguarda pedido explícito)
- [ ] Teste pré-existente falhando, fora do escopo: `calendario-rotina-p1.test.ts` › "folgas fixas do dia são o piso mesmo com exceção da data" (já falhava antes desta leva)

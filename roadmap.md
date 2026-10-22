# Roadmap — Pré-admissão ativa na rotina da loja

- [x] Sugestão de horário: horário base mais repetido do cargo, uniforme em todos os dias, sem variação de sex/sáb/dom (`sugerirSemanaBaseCargo` + `montarSemanaUniforme`)
- [x] Nunca sugerir 7 dias trabalhados: folga semanal garantida (mais comum do cargo ou dia menos trabalhado)
- [x] Botão "Horário padrão do cargo" na aba Horário de Trabalho (corrige a ficha da Verônica)
- [x] RPC `dp_preadmissao_ativar_rotina`: cadastro provisório freelancer (CLT→mensalista, intermitente→diarista), exige cargo/unidade/jornada com folga
- [x] Efetivação converte o MESMO cadastro para o regime formal (sem duplicar), preservando histórico da rotina
- [x] Correções de banco: cast do enum regime_previsto, folgas dominicais (mínimo legal 1/mês), normalização de sexo
- [x] Selo "Aguardando registro" na lista de pré-admissões e na Rotina (com dias)
- [x] Provas no banco em transação desfeita: ativação, idempotência, conversão CLT — nada gravado em dados reais
- [ ] Homologação visual pelo gestor na ficha da Verônica (aguarda uso real)

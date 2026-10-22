# Roteiro — Pré-admissão na rotina da loja + sugestão de horário

## 1. Sugestão de horário pelo mais frequente do cargo
- [ ] `modeloHorarioRanking.ts`: nova função pura `sugerirSemanaBaseCargo` (horário base mais frequente do cargo + dia de folga mais comum; nunca 7 dias; sem exceções de sex/sáb/dom)
- [ ] `ColaboradorJornadaPanel.tsx`: sugestão automática passa a montar semana uniforme (todos os dias no horário base, 1 folga) em vez de copiar a semana inteira de um colega
- [ ] Botão "Usar horário padrão do cargo" para uniformizar com 1 clique uma ficha já preenchida (caso Verônica)

## 2. Ativação operacional na rotina (pré-admissão)
- [ ] Migração: RPC `dp_preadmissao_ativar_rotina` (cria colaborador provisório freelancer — CLT→mensalista, intermitente→diarista — com jornada, sem portal, sem efeito CLT; marca `admin_dados.rotina`)
- [ ] Migração: `dp_preadmissao_efetivar_direto` converte o provisório (regime/forma/data de admissão oficiais) em vez de inserir duplicado
- [ ] `PreadmissaoRevisaoDialog`: ação "Ativar na Rotina da Loja" com data de início e jornada (da ficha ou da sugestão do cargo); aviso âmbar quando faltar jornada
- [ ] Lista de pré-admissões: selo "Na rotina · Aguardando registro há X dias"

## 3. Rotina da loja
- [ ] Panorama: selo "Aguardando Registro (X dias)" na pessoa provisória (`origem_cadastro = 'preadmissao_rotina'`)

## 4. Validação
- [ ] Testes unitários da sugestão (vitest)
- [ ] Prova do RPC no banco em transação desfeita
- [ ] tsgo + vitest + build; Edge/functions deploy se necessário
- [ ] Nada publicado sem pedido

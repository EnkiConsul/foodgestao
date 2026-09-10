# Mudança de condições: só dentro da formalidade

Hoje a tela "Alterar Condições de Trabalho" lista todos os vínculos (CLT, Intermitente, Estagiário, Temporário, Freelancer, PJ, MEI) sem restrição, então é possível transformar um CLT em Freelancer com uma simples mudança de vigência. Isso não deve ser permitido.

## Regra

1. **Registro formal (CLT, Intermitente, Estagiário, Temporário)**
   - Pode mudar livremente **dentro da formalidade**: Intermitente ↔ CLT, jornada integral ou parcial, cargo, unidade, setor, turno/horário, sindicato, benefícios, forma de pagamento.
   - **Não pode** virar Freelancer, PJ ou MEI pela tela de condições. Essas opções deixam de aparecer, com um aviso curto: para encerrar o contrato formal é preciso fazer o desligamento.

2. **Registro informal (Freelancer, folguista/teste, PJ, MEI)**
   - Pode ser **efetivado**: a tela oferece contratar como CLT (integral ou parcial), Intermitente, Estagiário ou Temporário.
   - Essa efetivação entra como **novo contrato** (contagem de férias, 13º e tempo de casa começa na data informada), já sugerida e confirmada na própria tela.
   - Mudar de Freelancer para PJ/MEI (informal para informal) segue permitido.

3. **Sair do formal para o informal**
   - Caminho único: desligamento do contrato atual e, depois, um novo cadastro como Freelancer.
   - No novo cadastro é permitido aproveitar os dados de um colaborador inativo (mesma pessoa, dados pessoais e documentos reaproveitados), do mesmo jeito que numa readmissão futura. O histórico de documentos do contrato anterior continua acessível pelo portal.

4. **Bloqueio também no servidor**
   - A tentativa de aplicar uma mudança de formal para informal é recusada com mensagem clara, mesmo fora da tela.

## Detalhes técnicos

- `src/lib/dp/contrato-policy.ts`: acrescentar `formalizado: boolean` por regime (CLT/intermitente/estágio/temporário = true; freelancer/PJ/MEI = false) e um helper `regimesPermitidosNaMudanca(regimeAtual)` + `mudancaRegimePermitida(de, para)`, com testes em `__tests__/contrato-policy.test.ts`.
- `ColaboradorCondicoesDialog.tsx`: substituir a constante local `REGIMES` pela lista derivada do regime atual; exibir aviso quando houver opções ocultas; quando o regime atual é informal e o novo é formal, forçar `modo = "novo_contrato"` (mantendo a confirmação obrigatória já existente).
- `dp_colaborador_aplicar_condicao`: validar a transição e levantar exceção em formal → informal; testes SQL/vitest cobrindo CLT→freelancer (recusa), intermitente→CLT (aceita) e freelancer→CLT (aceita como novo contrato).
- Reaproveitamento de dados de inativo no cadastro de freelancer: reutilizar o caminho de readmissão já existente no cadastro de colaborador (busca por CPF entre inativos); nenhuma nova tabela.

## Verificação

- `bunx tsgo --noEmit`, testes de DP e unitários.
- Navegador: abrir condições de um CLT (sem opções informais), de um freelancer (com opções formais e novo contrato) e conferir o histórico.

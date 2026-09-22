# Pessoas 360° — Fase 9: Cadastros de remuneração e benefícios

## Por que esta fase

Conferi no banco o que ainda pode ser gravado direto pelo aplicativo. Todo o núcleo já protegido nas fases 1 a 8 continua fechado, e o que sobrou de maior risco são os cadastros que definem **quanto cada pessoa recebe**:

- cargos e pisos salariais por unidade (`dp_cargos`, `dp_cargo_salarios`)
- catálogo de benefícios e padrões por cargo/unidade/empresa (`dp_beneficios`, `dp_beneficios_padroes`)
- adicional por tempo de serviço (`dp_adicionais_tempo_servico`)
- benefícios já atribuídos a cada pessoa (`dp_colaborador_beneficios`)

Hoje essas tabelas aceitam gravação direta de qualquer usuário logado: a regra de linha confere a empresa, mas **nada confere o conteúdo** — piso negativo, percentual absurdo, benefício de outra empresa colado em um cargo, valor sobrescrito sem registro de quem mudou. Também não há trava contra dois cliques criando o mesmo padrão duas vezes.

Acessos, assinaturas, planos, cupons e o módulo financeiro já estão adequados e ficam fora desta fase.

## O que passa a funcionar

1. **Cargo e piso salarial**: criar/alterar cargo e definir o piso por unidade só por rotina do servidor, que confere empresa, unidade, valor positivo dentro de faixa razoável, vigência sem sobreposição e exige justificativa ao reduzir um piso já vigente. Cada alteração de valor fica registrada com autor, valor anterior, valor novo e motivo.
2. **Benefícios e padrões**: o benefício precisa pertencer à empresa; o padrão precisa apontar para cargo/unidade da mesma empresa; valores e percentuais dentro de faixa; um padrão por escopo (repetir o envio devolve o mesmo registro em vez de duplicar).
3. **Adicional por tempo de serviço**: percentual e periodicidade validados, escopo da própria empresa, sem duas regras vigentes no mesmo escopo.
4. **Benefícios do colaborador**: só benefícios ativos da empresa da pessoa, sem duplicar o mesmo benefício vigente.
5. **Exclusão**: cargo, benefício, padrão e adicional saem da lista guardando quem excluiu, quando e por quê — nada é apagado de verdade, e cargo/benefício em uso não podem ser removidos.
6. **Gravação direta fechada**: as tabelas passam a aceitar só leitura pelo aplicativo; toda escrita entra pelas rotinas oficiais.

## Detalhes técnicos

- Migration isolada e reversível, com rollback documentado:
  - RPCs `SECURITY DEFINER` em `public` (EXECUTE apenas `authenticated` e `service_role`), com trava por empresa/escopo (`pg_advisory_xact_lock`) para idempotência: `dp_cargo_salvar`, `dp_cargo_piso_definir`, `dp_beneficio_salvar`, `dp_beneficio_padrao_salvar`, `dp_adicional_tempo_servico_salvar`, `dp_colaborador_beneficio_definir`, `dp_cadastro_remuneracao_excluir` (exclusão lógica genérica com tabela na lista permitida).
  - Conferências em rotinas privadas reutilizáveis: `private.dp_remuneracao_escopo_check` (empresa/unidade/cargo/setor coerentes) e `private.dp_valor_monetario_check`.
  - Trilha de alteração de piso em `dp_cargo_salario_eventos` (ou na tabela de eventos existente, se já cobrir o caso) com autor, valores e motivo.
  - Colunas de exclusão lógica (`removido_em`/`removido_por`/`removido_motivo`) onde ainda não existirem, com índice parcial dos registros ativos.
  - Políticas `*_admin_write` → `*_admin_read` (somente leitura), `REVOKE INSERT/UPDATE/DELETE` de `authenticated`, `REVOKE ALL` de `anon`, `GRANT ALL` de `service_role`.
  - Sem tocar dados existentes: nenhum `UPDATE`/`DELETE` de linhas de negócio.
- Frontend: nova camada `src/lib/dp/remuneracao-oficial.ts` chamada por `useDpCadastros`, `useDpBeneficiosPadrao`, `cargoSalarios.ts`, `AplicarPisoUnidadeDialog`, painel de cargos e ficha do colaborador; mensagens de erro em linguagem de negócio (`textoErroRemuneracao`).
- Listagens passam a ignorar registros excluídos.
- Testes: novos casos em `src/test/rls/` (visitante e usuário logado sem escrita direta; rotinas internas fora do alcance) e testes de unidade das mensagens e das faixas de valor.
- Provas no banco em transação desfeita (`begin; ... rollback;`): salvar cargo e piso funciona; duplo clique devolve o mesmo registro; empresa alheia, unidade de outra empresa, valor negativo, percentual fora da faixa, vigência sobreposta, redução de piso sem justificativa, benefício de outra empresa e gravação direta por fora — todos recusados; exclusão mantém histórico e recusa cargo em uso.
- Nada publicado: o site continua no ar como está.

## Ao final

Relatório obrigatório com leitura do plano, o que passou a funcionar, as provas feitas, contagens antes/depois e a conclusão **APROVÁVEL PARA PRÓXIMA FASE** — e parada para sua conferência.

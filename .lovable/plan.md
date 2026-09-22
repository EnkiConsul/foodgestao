# Fase 10 — Regras que governam as validações de Pessoas 360°

## Por que esta fase

As fases anteriores fecharam a gravação direta de fichas, documentos, escala, férias, folgas e cadastros de remuneração. Sobrou um conjunto de tabelas de **regras** que continuam aceitando gravação direta de qualquer usuário logado com papel de administrador da empresa:

- Configuração do DP da empresa (`dp_config_dp`)
- Bloqueios e datas bloqueadas (`dp_bloqueios`, `dp_bloqueio_regras`, `dp_datas_bloqueadas`)
- Regras de férias (`dp_ferias_regras`)
- Cobertura mínima por turno (`dp_cobertura_minima`)
- Regras de admissão e suas listas ligadas (`dp_admissao_regras` e tabelas de cargo/unidade/regime/sexo/parentesco)
- Jornadas do colaborador (`dp_colaborador_jornadas`)
- Dependentes (`dp_dependentes`)
- Disponibilidade em outras unidades (`dp_apoio_unidades`)
- Avisos e comentários (`dp_avisos`, `dp_avisos_comentarios`)

Confirmado no banco: a regra de linha dessas tabelas confere apenas a empresa. Nada confere o **conteúdo** — percentual ou quantidade fora de faixa, unidade/cargo/turno de outra empresa dentro do mesmo registro, vigências sobrepostas, data de início depois do fim, período de férias impossível — e não há trava contra duplo clique nem registro de quem alterou a regra.

Isso importa porque são exatamente as regras que as rotinas oficiais das fases 4, 5 e 6 consultam para aprovar ou recusar férias, folgas e escala. Regra gravada errada por fora enfraquece as travas já entregues.

## O que será feito

1. **Rotinas oficiais no servidor** para salvar cada bloco de regra, com conferência de conteúdo antes de gravar:
   - Configuração do DP: campos permitidos por lista fechada, faixas de dias, horas e percentuais.
   - Bloqueios e datas bloqueadas: início ≤ fim, unidade da própria empresa, sem duplicar o mesmo intervalo.
   - Regras de férias: limites de fracionamento, antecedência e dias, sem duas regras vigentes sobrepostas no mesmo escopo.
   - Cobertura mínima: turno e unidade da mesma empresa, quantidade dentro de faixa, vigência sem sobreposição.
   - Regras de admissão: listas ligadas gravadas na mesma transação da regra; cargo e unidade sempre da mesma empresa.
   - Jornadas do colaborador, dependentes e disponibilidade em outras unidades: escopo conferido no servidor, vigências sem sobreposição, sem duplicar o mesmo vínculo.
   - Avisos e comentários: autor derivado da sessão, empresa e unidade conferidas.
2. **Idempotência**: repetir o mesmo salvamento devolve o registro existente em vez de criar duplicata.
3. **Exclusão lógica** onde a regra é histórico relevante (bloqueios, regras de férias, cobertura, regras de admissão), preservando o registro.
4. **Auditoria**: alteração de regra registra quem alterou, quando e o valor anterior.
5. **Gravação direta fechada** nessas tabelas: leitura permanece como está; gravar passa a ser só pelas rotinas oficiais e pelos serviços internos.
6. **Telas migradas** para as rotinas, com mensagens em linguagem de negócio, e listagens ignorando registros excluídos.

## Fora do escopo

Módulo financeiro, assinaturas, planos, cupons e papéis de acesso — já conferidos e adequados. Nada de publicação do frontend.

## Detalhes técnicos

- Migration isolada e reversível: colunas `removido_em`/`removido_por`/`removido_motivo` com índices parciais onde houver exclusão lógica; funções privadas de conferência (escopo de empresa, faixas, allowlist de campos jsonb, sobreposição de vigência) com EXECUTE revogado de PUBLIC/anon/authenticated; RPCs `SECURITY DEFINER` em `public` com EXECUTE apenas para `authenticated` e `service_role`, derivando `auth.uid()` e a empresa no servidor; fila por advisory lock por empresa/escopo para idempotência.
- Após a migration: `REVOKE INSERT/UPDATE/DELETE` de `authenticated`, policies de escrita substituídas por leitura, `GRANT ALL` para `service_role`.
- Frontend: novo módulo `src/lib/dp/regras-oficial.ts` com tradutor de erros; hooks de configuração, bloqueios, férias, cobertura, admissão, dependentes, jornadas, apoio e avisos migrados.
- Provas: execução em transação desfeita cobrindo caminho válido e recusas (empresa alheia, escopo cruzado, faixa inválida, vigência sobreposta, data invertida, gravação por fora), mais testes de negação para visitante em `src/test/rls/`.
- Fecho da fase: relatório de leitura do plano e da execução, contagens antes/depois provando que nada existente foi alterado, `bunx vitest run`, `bunx tsgo --noEmit -p tsconfig.app.json` e conferência do linter contra o patamar de 288 avisos.

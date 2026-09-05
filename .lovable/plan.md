# Regra "quantidade de pessoas por dia" com escolha de cargos

## Problema

Na Particularidade de Folgas, a regra "Quantidade de pessoas por dia" não deixa escolher cargos — hoje ela sempre vale para todo mundo da unidade. O gestor quer poder dizer, por exemplo: "no sábado, no máximo 1 pessoa dos cargos Cozinheiro e Ajudante em folga".

O banco de dados e a leitura do limite já sabem trabalhar com cargos nessa regra; o que falta é a tela permitir escolher e a gravação não descartar a escolha.

## O que muda

1. **Cadastro da regra**: ao escolher o tipo "Quantidade de pessoas por dia", aparece a lista de cargos para marcar (opcional). Texto de ajuda: "Sem cargo marcado, a regra vale para todos os cargos da unidade; com cargos marcados, a contagem vale só para pessoas desses cargos". O tipo "Limite por cargo" continua exigindo ao menos um cargo.
2. **Gravação**: os cargos escolhidos passam a ser salvos também nas regras de quantidade (hoje são descartados na hora de salvar). Replicar para outras unidades e o modo rascunho (janela de nova regra de unidade) já levam os cargos junto.
3. **Contagem no portal do colaborador**: hoje o portal conta todas as folgas da unidade no dia. Quando a regra do dia for limitada a cargos, a contagem passa a considerar só as folgas de pessoas desses cargos — assim uma cozinheira de folga não consome a vaga dos garçons, e vice-versa.
4. **Resumo da regra na lista** já exibe os cargos ("sábados, Cozinheiro: no máximo 1 em folga") — sem mudança.

Sem migração de banco: a RPC `dp_folga_limite_dia` já filtra por cargo e conta só pessoas do cargo, e a atribuição automática de folgas usa essa RPC por colaborador — ou seja, quem já escolhe/é distribuído com cargo respeita a regra automaticamente.

## Detalhes técnicos

- `src/hooks/useDpFolgaLimites.tsx` (linha ~154): trocar `input.tipo === "cargo" ? input.cargo_ids : []` por gravar `cargo_ids` sempre que o tipo não for "colaboradores".
- `src/components/dp/folgas/FolgaRegrasPanel.tsx`: exibir o bloco de cargos também quando `form.tipo === "quantidade"`, com rótulo/ajuda indicando opcionalidade; manter a exigência de cargo só para o tipo "cargo"; ajustar o texto de ajuda do tipo quantidade.
- `src/pages/dp/portal/DpMeuCalendario.tsx`: além do `dayLimits` (número), manter um mapa do escopo de cargos da regra resolvida por dia; incluir `cargo_id` no join de `dp_colaboradores` na consulta de folgas; na validação de lotação (passo 7), quando a regra do dia tiver cargos, contar só folgas de pessoas com esses cargos.
- `src/lib/dp/folga-limites.ts`: extrair uma função pura `ocupacaoNoEscopo(...)` (ou equivalente) para a contagem com escopo de cargo, reutilizada no portal e testável.
- Sem `as any`; a tipagem do join novo usa os tipos existentes.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/test/unit/folgaLimites.test.ts src/test/unit/folgaJanela.test.ts` com casos novos (regra de quantidade com cargo: combina só com o cargo, e contagem respeita o escopo), lint nos arquivos alterados e conferência visual no cadastro e no portal.

## Fora do escopo

- Calendário do gestor (visão geral por dia) e a exceção por data específica, que seguem sem recorte de cargo.
- Atribuição manual pelo gestor, que hoje não é bloqueada por limite.

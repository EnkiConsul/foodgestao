# Pessoa avulsa na rotina do dia (teste ou folguista)

Permitir registrar na rotina alguém que não é colaborador cadastrado: uma pessoa em teste na loja ou um folguista chamado para cobrir alguém pontualmente. Só nome, cargo, unidade, período e horário.

## Como vai funcionar

Na tela da rotina (Pessoas > Operação), um botão "Registrar pessoa avulsa" abre um cadastro rápido:

- Nome da pessoa (obrigatório)
- Unidade e cargo que vai ocupar (obrigatórios)
- Tipo: Teste ou Folguista
- Quando for folguista: escolher, opcionalmente, o colaborador que está sendo coberto
- Data inicial e data final (o padrão é o mesmo dia; permite um teste de vários dias)
- Horário de entrada e saída, com opção "termina no dia seguinte"
- Observação livre (opcional)

Efeitos na rotina:

- A pessoa aparece no bloco do período de funcionamento correspondente ao horário dela, dentro do card do cargo, com uma etiqueta "Teste" ou "Folguista" e, quando houver, "cobrindo <nome>".
- Conta como quem está trabalhando no dia: entra no total de confirmados, na contagem do cargo e na avaliação de cobertura mínima do turno, igual a um colaborador escalado.
- É possível editar e excluir o registro pelo próprio dia.
- Quem pode registrar: os mesmos perfis que hoje registram ausência (dono e administrador).

Fora do escopo: transformar a pessoa avulsa em colaborador cadastrado, pagamento, ponto, folgas e convocação.

## Detalhes técnicos

Banco (migração nova, a partir da última):

- Tabela `public.dp_pessoas_avulsas`: `company_id`, `unidade_id`, `cargo_id`, `nome`, `tipo` (novo enum `dp_pessoa_avulsa_tipo`: `teste` | `folguista`), `cobre_colaborador_id` (nullable), `data_inicio`, `data_fim`, `entrada`, `saida`, `termina_no_dia_seguinte`, `observacao`, `criado_por`, `created_at`, `updated_at`.
- GRANTs para `authenticated` e `service_role`, RLS habilitada, políticas de leitura para membros da empresa e escrita restrita a owner/admin (padrão já usado nas demais tabelas do DP), trigger de `updated_at` e trigger de validação `data_fim >= data_inicio`.
- Índice por (`company_id`, `data_inicio`, `data_fim`).

Frontend:

- `operacao-panorama.ts`: nova entrada `avulsos: PessoaAvulsaPanorama[]` em `ContarDiaInput`; `contarDia` acrescenta essas pessoas a `pessoas` com `categoria: "fixo"`, `origem: "avulso"` (novo valor de `origem`) e campos `avulso_tipo` / `cobre_nome` em `PessoaPanorama`, somando em `trabalhando` e em `contagens.fixo`. `blocosPorFuncionamento` continua funcionando pois usa `janelaPessoa`; a chave de alocação passa a usar um id estável (`colaborador_id` recebe `avulso:<uuid>`).
- `useDpOperacaoPanorama.tsx`: busca dos registros da competência, expandindo o período em dias, e exposição de `avulsos` para edição/exclusão.
- `DpOperacaoPanorama.tsx`: botão no cabeçalho e dentro do popout do dia; novo `DpPessoaAvulsaDialog` (criar/editar) seguindo o padrão de `DpRegistrarAusenciaDialog`, com validação Zod em `src/lib/validations.ts` via `validateWithToast`.
- `DetalheDiaOperacao`: etiqueta do tipo e "cobrindo <nome>" nas linhas de pessoa avulsa, e ação de editar/remover.
- Nenhum `as any`; tipos regenerados após a migração.

Testes:

- Unitários em `src/lib/dp/__tests__/operacao-panorama.test.ts`: pessoa avulsa soma em `trabalhando`/`fixo`, cai no período correto do funcionamento, e período de vários dias aparece em todos os dias e em nenhum fora dele.
- Teste de banco em `supabase/tests`: RLS impede leitura de outra empresa e `data_fim < data_inicio` é rejeitado.
- `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx eslint`, `bunx vitest run src/lib/dp/__tests__`.

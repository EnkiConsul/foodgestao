# Setores / áreas da unidade

## Diagnóstico

- Não existe hoje nenhuma estrutura de setor/área: as ocorrências de "setor" no código são apenas `setor_comercio` (configuração de descanso semanal). Não há tabela, coluna nem cadastro equivalente — nada será duplicado.
- `dp_colaboradores` não tem `setor_id`. O cadastro de unidade (`UnidadeFormDialog`) tem 3 abas: Dados, Funcionamento, Sindicato.
- A rotina (`DpOperacaoPanorama` + `src/lib/dp/operacao-panorama.ts`) agrupa por unidade e cargo, com bloco "Sem cargo" já previsto.
- As regras de folga já são um cadastro único com tipos "quantidade de pessoas", "limite por cargo" e "não folgam juntos" (`dp_folga_limite_regras` + tabelas de vínculo de cargos e colaboradores), com resolução espelhada em `src/lib/dp/folga-limites.ts` e no banco.

## O que será feito

### 1. Cadastro de setores por unidade
- Nova tabela de setores, sempre ligada a uma unidade e à empresa, com nome, descrição, ativo e datas.
- Nome único por unidade ignorando maiúsculas/acentos ("Salão" = "salão" = "SALÃO"). Unidades diferentes podem ter os mesmos nomes.
- Nova aba **Setores** no cadastro da unidade: lista com nome, quantidade de colaboradores e situação, com criar, editar e ativar/desativar.
- Exclusão: se houver colaborador vinculado, não apaga — mensagem "Este setor possui colaboradores vinculados. Você pode desativá-lo."

### 2. Setor no colaborador (opcional)
- Novo campo "Setor / Área" no cadastro do colaborador, abaixo de Cargo, com texto de apoio "Opcional. Use para identificar a área da unidade onde o colaborador atua normalmente."
- Lista somente setores ativos da unidade escolhida; botão "+ Novo setor" abre criação rápida (nome e descrição) usando o mesmo cadastro, já vinculado à unidade selecionada, e seleciona o setor criado.
- Ao trocar a unidade, o setor incompatível é limpo com aviso: "O setor foi removido porque pertence à unidade anterior. Selecione um setor da nova unidade."
- Setor desativado num colaborador antigo continua vinculado e aparece como "Salão — inativo".
- Colaboradores existentes seguem válidos sem setor.

### 3. Listagem e busca de colaboradores
- Coluna "Setor" (configurável, como as demais) e filtro "Setor" ao lado de Unidade/Cargo/Status/Perfil, carregado junto dos colaboradores (sem consultas extras por linha).

### 4. Rotina / operação
- Filtro "Setor" (só os setores da unidade escolhida) e agrupamento Unidade → Setor → Cargo, mantendo o cargo como dimensão.
- Quem não tem setor aparece em "Sem setor" e continua contando nos totais.

### 5. Regras de folga por setor
- No cadastro de regras, "Quem compartilha este limite?" passa a aceitar: todos, cargo(s) ou setor(es).
- Vários setores na mesma regra dividem uma única cota, com o texto "Os setores selecionados compartilham o mesmo limite."
- Colaborador sem setor não entra em regra de setor; segue sujeito à regra geral ou à de cargo.
- Precedência: regra específica (setor ou cargo) vence a geral; ao salvar, é bloqueada a sobreposição do mesmo setor em duas regras específicas do mesmo dia/unidade ("O setor Salão já participa de outro limite específico para domingo").
- A distribuição automática de folgas passa a respeitar os limites por setor, mantendo a estratégia atual de datas vazias → menor ocupação → contingência do fim do mês. Cobertura mínima continua fora da trava de folgas.

### 6. Segurança entre empresas
Toda validação no banco: setor sempre da mesma empresa e da mesma unidade do colaborador; nada de outra empresa aparece em listas, filtros, rotina ou regras.

## Detalhes técnicos

- Migração: `dp_setores` (id, company_id, unidade_id, nome, descricao, ativo, created_at/updated_at/created_by/updated_by), FKs para `companies`/`dp_unidades`, índice único funcional em (unidade_id, nome normalizado com `lower(unaccent)`/fallback `lower(trim())`), índices em company_id/unidade_id/ativo, GRANTs para `authenticated` e `service_role`, RLS por empresa no padrão das demais tabelas de DP.
- `dp_colaboradores.setor_id uuid NULL` + FK e trigger de integridade (`setor.company_id = colaborador.company_id` e `setor.unidade_id = colaborador.unidade_id`), fail closed.
- Vínculo de regra: `dp_folga_limite_regra_setores` (regra_id, setor_id) espelhando o padrão de cargos; `dp_folga_limite_regras.tipo` ganha o valor `setor`.
- Atualizar `dp_folga_limite_dia` e as RPCs de criação/solicitação/autoatribuição para contar por grupo de setores; validação anti-sobreposição na função de gravação da regra; registrar `setor_id`/`cargo_id`/regra aplicada no histórico da folga para auditoria.
- Frontend: `src/lib/dp/folga-limites.ts` (novo tipo `setor`, `setor_ids`, precedência e testes), `src/lib/dp/operacao-panorama.ts` (agrupamento por setor + "Sem setor"), novo hook `useDpSetores`, `UnidadeFormDialog` (aba Setores + painel `UnidadeSetoresPanel`), `SetorQuickCreateDialog` no molde de `CargoQuickCreateDialog`, `ColaboradorFormDialog`, `DpColaboradores`, `DpOperacaoPanorama`, `useDpColaboradores` (expor `setor_nome`), `useDpFolgaLimites`, `FolgaRegrasFormDialog`/`FolgaRegrasPanel`, `src/lib/validations.ts`.
- Tipos Supabase regenerados após a migração; sem `as any` permanente.
- Testes: unitários de precedência/cota compartilhada por setor e agrupamento da rotina; RLS/tenancy para setor de outra empresa/unidade; testes de UI dos fluxos de criação pela unidade e pelo colaborador; validação com build, testes, lint e typecheck estrito.
- Rollback: remover vínculo de regras por setor, `setor_id` e a tabela `dp_setores` (dados de setor são perdidos; nada mais depende deles).

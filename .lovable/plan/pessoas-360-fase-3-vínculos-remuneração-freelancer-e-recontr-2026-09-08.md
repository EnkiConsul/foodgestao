# Pessoas 360° — Fase 3: Vínculos, Remuneração, Freelancer e Recontratação

## Diagnóstico atual (confirmado agora)

- **Folha de Pagamento**: rotas `/dp/folha*` já redirecionam para `/dp` (`App.tsx:454-462`) e não constam da navegação principal (`src/config/dpNavigation.tsx`). Ainda assim, textos soltos em telas, mensagens e validações podem continuar sugerindo que a Aveto 360 "gera folha".
- **Histórico de jornada**: existe `dp_colaborador_jornadas` com `inicio`/`fim` e `dp_colaborador_config_trabalho` com `vigencia_inicio`/`vigencia_fim`, ou seja, a base de vigência já está no banco.
- **Histórico de vínculo/condições**: `dp_colaboradores` guarda o estado atual (`tipo_vinculo`/`regime`, `cargo_id`, `unidade_id`, `setor_id`, remuneração, etc.), mas não há tabela de histórico genérico de alterações de condições.
- **Folguista/Teste → Colaborador**: `dp_pessoas_apoio` já tem `colaborador_id` nullable, permitindo vincular uma pessoa de apoio a um colaborador existente.
- **Tela de Colaboradores**: hoje mostra apenas `dp_colaboradores`, com abas Todos / Ativos / Desligados / Incompletos. Folguistas e pessoas em teste vivem em tela separada (`/dp/cadastros/pessoas-apoio`).
- **Freelancer**: já é opção de vínculo no cadastro (`TIPOS_VINCULO` em `ColaboradorFormDialog.tsx`), mas ainda pode ser obrigado a preencher campos de CLT (sindicato, salário-base, benefícios) dependendo do fluxo.

## O que esta fase entrega

### 1. Remover referências visíveis à Folha de Pagamento

Auditar e limpar textos que dizem ou sugerem que a Aveto 360 calcula/gera Folha de Pagamento:

- páginas e componentes do DP;
- mensagens de erro, placeholders e tooltips;
- validações que bloqueiam ação "porque a folha será gerada";
- rótulos de botões, cards e abas;
- portal do colaborador.

Preservar sem tocar:

- Folha de Ponto, batidas, jornadas, espelho, ajustes;
- remuneração contratual do colaborador;
- contracheques produzidos externamente (somente leitura/anexo);
- importação de documentos.

### 2. Alterar Condições de Trabalho

Novo fluxo acessível na ficha do colaborador: **Alterar Condições de Trabalho**.

Campos editáveis com data de vigência:

- Tipo de Vínculo / Regime;
- Cargo;
- Unidade;
- Setor Habitual;
- Jornada (turno/padrão);
- Remuneração.

Regras:

- a nova vigência começa na data informada;
- a vigência anterior é encerrada no dia anterior;
- não sobrescrever o passado;
- operação atômica;
- histórico auditável.

Aproveitar `dp_colaborador_jornadas` e `dp_colaborador_config_trabalho` para jornada. Para vínculo/cargo/unidade/setor/remuneração, avaliar se é possível estender uma tabela existente (histórico de vínculo) ou se é necessária uma nova tabela de histórico de condições.

### 3. CLT em Regime de Tempo Parcial

Separar claramente:

- **Salário de Referência do Cargo** (piso/padrão, não muda por colaborador);
- **Remuneração Contratual do Colaborador** (pode ser proporcional a 30h, 25h etc.).

O cadastro do colaborador deve permitir informar remuneração contratual diferente do salário de referência do cargo sem sobrescrever o cargo.

### 4. Freelancer sem regras de CLT

No cadastro/edição de Freelancer:

- não exigir sindicato;
- não exigir salário-base CLT nem piso sindical;
- não exigir benefícios de CLT;
- não aplicar regras de adiantamento salarial CLT;
- permitir "Remuneração Acordada" com formas flexíveis: fixo, por hora, por diária, semanal, mensal, por turno, por serviço/acordo;
- manter Cargo apenas como identificação da atividade.

### 5. Transformar Folguista / Em Teste em Colaborador

Ação na tela de pessoas de apoio: **Transformar em Colaborador**.

- reaproveitar nome, CPF, telefone, data de nascimento, gênero, unidade, cargo, setor;
- abrir cadastro de colaborador com esses dados pré-preenchidos;
- completar vínculo, remuneração, jornada, documentos, acesso;
- se já existir colaborador com mesmo CPF, oferecer vinculação ao invés de duplicar;
- após conversão, manter `dp_pessoas_apoio` como histórico e preencher `colaborador_id`;
- preservar dias antigos em que trabalhou como folguista/teste.

### 6. Recontratação

Na tela de colaboradores desligados, diferenciar:

- **Reintegrar**: restaura o vínculo anterior quando aplicável;
- **Recontratar**: cria novo vínculo laboral para a mesma pessoa.

Na recontratação:

- preservar histórico anterior;
- nova data de admissão;
- nova vigência;
- nova jornada;
- novo regime;
- nova remuneração;
- nova matrícula quando aplicável;
- manter a mesma identidade (CPF/pessoa).

### 7. Visão unificada: Todos | Colaboradores | Folguistas | Em Teste

Na tela `/dp/colaboradores`, adicionar navegação:

```text
Todos | Colaboradores | Folguistas | Em Teste
```

- "Colaboradores" = `dp_colaboradores`;
- "Folguistas" e "Em Teste" = `dp_pessoas_apoio` filtrado por `tipo`;
- "Todos" = união em memória para visualização, sem misturar tabelas no banco;
- cada linha mostra claramente o tipo/vínculo/origem;
- ações de cada grupo permanecem distintas (ex.: transformar em colaborador só para folguista/teste).

## Critérios de aceite

- Nenhuma tela diz que a Aveto 360 gera Folha de Pagamento.
- Folha de Ponto continua funcionando normalmente.
- É possível alterar condições de trabalho com data de vigência sem apagar o passado.
- CLT em regime parcial pode ter remuneração contratual diferente do salário de referência do cargo.
- Freelancer não é obrigado a preencher sindicato, salário-base CLT ou benefícios CLT.
- Folguista/pessoa em teste pode ser transformado em colaborador sem duplicar CPF.
- Reintegrar e Recontratar são ações distintas e preservam histórico.
- A tela de Colaboradores permite filtrar entre Todos/Colaboradores/Folguistas/Em Teste.
- Títulos e cabeçalhos seguem a regra de Title Case do plano mestre.

## Fora de escopo nesta fase

- Fases 4 a 6 do plano mestre;
- novas funcionalidades de Convocações;
- cálculo propriamente dito de Folha de Pagamento;
- remoção de tabelas/dados da folha (apenas ocultar da navegação e limpar textos);
- alterações em módulos financeiros externos ao Pessoas 360.

## Detalhes técnicos

- Arquivos esperados: `src/config/dpNavigation.tsx`, `src/App.tsx`, `src/pages/dp/DpColaboradores.tsx`, `src/components/dp/ColaboradorFormDialog.tsx`, `src/components/dp/RemuneracaoFields.tsx`, `src/pages/dp/DpPessoasApoio.tsx`, `src/hooks/useDpPessoasApoio.tsx`, `src/hooks/useDpColaboradores.tsx`, `src/lib/dp/contrato-policy.ts`, `src/lib/dp/cadastro-completude.ts`, migrações em `supabase/migrations/`.
- Antes de criar nova tabela de histórico, auditar se `dp_regras_historico` ou estrutura equivalente já atende.
- Validação com build, typecheck e testes unitários existentes.

# Folgas — cadastro único de regras e novas travas

## 1. Um só cadastro de "Regras de folga", junto dos dias de descanso

Hoje o limite de pessoas por dia é um bloco solto no fim da tela. Ele passa a ser um cadastro único chamado **"Regras de folga"**, logo depois do bloco onde o gestor marca os dias de descanso negociados.

Ao clicar em "Nova regra", o gestor escolhe primeiro o **tipo de regra**:

- **Quantidade de pessoas por dia** — no máximo X pessoas em folga no dia (toda a empresa ou uma unidade).
- **Limite por cargo** — no máximo X pessoas de um ou mais cargos em folga no dia.
- **Colaboradores específicos que não folgam juntos** — duas ou mais pessoas que não podem ter folga na mesma data (ex.: Hanna e Sara).

Os campos do formulário mudam conforme o tipo, então não há campos separados espalhados pela tela. Todos os tipos compartilham escopo (empresa ou unidade), dia da semana, vigência (início e fim opcionais) e liga/desliga.

Várias regras podem existir ao mesmo tempo e o sistema lê **todas** na hora de liberar a marcação: cada regra é verificada de forma independente e a primeira que impedir o dia bloqueia a marcação, com a mensagem daquela regra. Entre regras de limite, a mais específica (unidade + cargo + dia) continua vencendo a mais geral; um limite lançado para uma data específica no calendário continua sendo exceção e vence as regras fixas.

A lista mostra todas as regras juntas, com selo do tipo, resumo em linguagem simples ("Na Unidade Centro, sábados, Garçom: no máximo 2 em folga" / "Hanna e Sara não folgam no mesmo dia"), edição, liga/desliga e exclusão, e um filtro por tipo.

## 2. Dia da semana limitado aos dias negociados

No cadastro de qualquer regra, a lista de dias da semana passa a mostrar somente os dias marcados em "Dias de descanso negociados" (mais a opção "todos os dias"), já que folga só acontece nesses dias. No padrão CLT aparece apenas domingo. Se nenhum dia estiver marcado, a tela avisa para marcar os dias de descanso primeiro em vez de mostrar uma lista vazia. Regras já salvas com um dia que saiu da lista continuam visíveis e sinalizadas como "dia não é mais dia de descanso".


## 3. Período mensal de escolha ligado por padrão (10 a 20) e comparação com o corte dos vales

- O período mensal passa a vir **habilitado** por padrão, abrindo no dia 10 e encerrando no dia 20, para novas empresas e unidades.
- Empresas que já existem e nunca configuraram o período também passam a ter o período ligado com 10/20; quem já ajustou os dias mantém o que escolheu.
- Dentro do bloco do período aparece um quadro informativo com as datas de corte do vale-alimentação e do vale-transporte da empresa (dia do pagamento e dia do corte já cadastrados nos benefícios), com um botão "Usar a data de corte dos vales" que preenche o dia de encerramento com o corte mais antecipado entre os dois. Se os vales não estiverem configurados, o quadro explica isso e não sugere data. A escolha continua sendo do gestor — nada é alterado sozinho.

## 4. Regra de colaboradores que não folgam juntos

Dentro do mesmo cadastro, como um dos tipos de regra:

- O gestor dá um nome curto à regra e escolhe duas ou mais pessoas que não podem ter folga na mesma data.
- A restrição olha apenas folgas (marcadas pelo colaborador, atribuídas pelo administrador ou definidas automaticamente); férias e licenças não entram na conta.
- A trava vale nos três caminhos: marcação pelo portal ("Sara já está de folga neste dia e vocês não podem folgar juntos"), atribuição pelo administrador (mesmo aviso, sem gravar) e distribuição automática do fim do período, que pula o dia e procura o próximo permitido.
- Se a distribuição automática não encontrar dia sem conflito, a pessoa entra no aviso já existente no topo do calendário de folgas, com o motivo.

## Detalhes técnicos

Banco (migrações novas, nada de editar as antigas):
- `dp_config_dp`: `ALTER COLUMN folga_janela_ativa SET DEFAULT true`; atualização de dados separada para ligar o período (10/20) nas linhas que ainda estão em `false` com os dias ainda nos valores padrão.
- `dp_folga_limite_regras` ganha `tipo text not null default 'quantidade'` (`quantidade` | `cargo` | `colaboradores`) e `nome text`; `maximo` passa a ser exigido só nos tipos de limite (trigger de validação por tipo, não CHECK dependente de outra tabela). As regras existentes são classificadas como `cargo` quando têm cargos vinculados e `quantidade` quando não têm.
- Nova `dp_folga_limite_regra_colaboradores` (PK regra_id + colaborador_id, FK cascade), GRANTs para `authenticated`/`service_role` e RLS no padrão DP: leitura por membro da empresa (`private.is_company_member`), escrita por admin/owner (`private.is_company_admin_or_owner`).
- `dp_folga_limite_dia` passa a considerar só as regras de tipo `quantidade`/`cargo`.
- Nova `dp_folga_conflito_colaboradores(_company uuid, _colaborador uuid, _data date)` → colaborador em conflito (ou null), lendo as regras de tipo `colaboradores` vigentes/ativas do escopo e as folgas ativas + solicitações pendentes/aprovadas do dia.
- `dp_folgas_validar_unificado` (ponto de validação usado por `dp_folga_criar_admin` e `dp_folga_solicitar`): novo erro `FOLGA_INCOMPATIBILIDADE` com o nome do colega em conflito no `detail`; `dp_folga_criar_admin` devolve `ok:false, incompatibilidade:true, colega`.
- `dp_folga_autoatribuir_competencia`: ao escolher o dia, descarta datas em conflito; sem data possível, grava o motivo em `detalhes` da execução.

Frontend:
- `DpConfiguracoesJornada.tsx`: mover `<FolgaLimitesPanel />` (renomeado para `FolgaRegrasPanel`) para depois do `SubSection` "Base Da Regra De Folgas"; passar os dias negociados efetivos (via `diasElegiveisDaConfig`) como prop `diasPermitidos`; novo quadro de corte dos vales no bloco do período usando `useDpValeRegrasEmpresa` + `periodoVaDe` de `@/lib/dp/va-calculo`.
- `src/components/dp/folgas/FolgaRegrasPanel.tsx`: seletor de tipo no formulário, campos condicionais (máximo/cargos/colaboradores via multi-select de `useDpColaboradores`), `diasPermitidos` filtrando o `Select` de dia da semana, lista unificada com selo de tipo e filtro.
- `useDpFolgaLimites.tsx`: incluir `tipo`, `nome` e `colaborador_ids` na leitura e na gravação (substituindo os vínculos a cada salvamento, como já é feito com cargos).
- `DpAdminCalendario.tsx` e `DpMeuCalendario.tsx`: tratar o novo erro/retorno com mensagem clara; `DpFolgas.tsx` inclui o motivo de conflito no aviso da distribuição automática.
- `src/lib/dp/folga-limites.ts`: `tipo` no tipo `RegraLimiteFolga`, `resolverLimiteFolga` ignora regras de colaboradores, novos helpers puros `diasPermitidosParaLimite(cfg)`, `conflitoColaboradores(...)` e `resumoRegra(...)` por tipo; `src/lib/dp/folga-janela.ts`: `distribuirFolgasAutomaticas` recebe os grupos incompatíveis e descarta datas em conflito. Sem `as any`; tipos regenerados após as migrações.


Testes: filtro de dias permitidos (CLT vs. acordo com sábado), sugestão de encerramento a partir do corte dos vales (VA e VT diferentes, vales não configurados), conflito de incompatibilidade em portal/admin, distribuição automática pulando o dia em conflito e caso sem dia possível. Build, testes, lint e typecheck reais com números reportados.

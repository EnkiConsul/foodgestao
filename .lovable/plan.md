# Folgas — reorganizar as regras e novas travas

## 1. Aproximar "Quantas pessoas podem folgar por dia" dos dias de descanso

O bloco de limites hoje fica no fim da tela, longe de onde o gestor marca os dias de descanso negociados. Ele passa a aparecer imediatamente depois do bloco "Base da regra de folgas" (onde ficam os dias negociados e o teto mensal), antes de "Frequência da folga dominical". Nenhuma regra muda — só o lugar na tela.

## 2. Dia da semana da nova regra limitado aos dias negociados

No cadastro de uma nova regra de limite, a lista de dias da semana passa a mostrar somente os dias marcados em "Dias de descanso negociados" (mais a opção "todos os dias"), já que folga só acontece nesses dias. Quando a empresa está no padrão CLT (só domingo), aparece apenas domingo. Se nenhum dia estiver marcado, a tela avisa para marcar os dias de descanso primeiro em vez de mostrar uma lista vazia. Regras já salvas com um dia que saiu da lista continuam visíveis e sinalizadas como "dia não é mais dia de descanso".

## 3. Período mensal de escolha ligado por padrão (10 a 20) e comparação com o corte dos vales

- O período mensal passa a vir **habilitado** por padrão, abrindo no dia 10 e encerrando no dia 20, para novas empresas e unidades.
- Empresas que já existem e nunca configuraram o período também passam a ter o período ligado com 10/20; quem já ajustou os dias mantém o que escolheu.
- Dentro do bloco do período aparece um quadro informativo com as datas de corte do vale-alimentação e do vale-transporte da empresa (dia do pagamento e dia do corte já cadastrados nos benefícios), com um botão "Usar a data de corte dos vales" que preenche o dia de encerramento com o corte mais antecipado entre os dois. Se os vales não estiverem configurados, o quadro explica isso e não sugere data. A escolha continua sendo do gestor — nada é alterado sozinho.

## 4. Nova regra: pessoas que não podem folgar no mesmo dia

Novo bloco "Quem não pode folgar no mesmo dia", junto das outras regras de folga:

- O gestor escolhe duas ou mais pessoas que não podem ter folga na mesma data (ex.: Hanna e Sara), com um nome curto para o grupo e liga/desliga.
- A restrição olha apenas folgas (marcadas pelo colaborador, atribuídas pelo administrador ou definidas automaticamente); férias e licenças não entram na conta.
- Lista com edição e exclusão e um resumo em linguagem simples ("Hanna e Sara não folgam no mesmo dia").
- A trava vale nos três caminhos: marcação pelo portal ("Sara já está de folga neste dia e vocês não podem folgar juntos"), atribuição pelo administrador (mesmo aviso, sem gravar) e distribuição automática do fim do período, que pula o dia e procura o próximo permitido.
- Se a distribuição automática não encontrar dia sem conflito, a pessoa entra no aviso já existente no topo do calendário de folgas, com o motivo.

## Detalhes técnicos

Banco (migrações novas, nada de editar as antigas):
- `dp_config_dp`: `ALTER COLUMN folga_janela_ativa SET DEFAULT true`; atualização de dados separada para ligar o período (10/20) nas linhas que ainda estão em `false` com os dias ainda nos valores padrão.
- Novas tabelas `dp_folga_incompatibilidades` (company_id, unidade_id nulo = empresa, nome, ativo, timestamps + trigger de updated_at) e `dp_folga_incompatibilidade_membros` (PK grupo_id + colaborador_id). GRANTs para `authenticated`/`service_role`, RLS no padrão DP: leitura por membro da empresa (`private.is_company_member`), escrita por admin/owner (`private.is_company_admin_or_owner`).
- Nova função `dp_folga_conflito_incompatibilidade(_company uuid, _colaborador uuid, _data date)` → colaborador em conflito (ou null), considerando folgas ativas e solicitações pendentes/aprovadas.
- `dp_folgas_validar_unificado` (ou o ponto de validação equivalente já usado por `dp_folga_criar_admin` e `dp_folga_solicitar`): novo erro `FOLGA_INCOMPATIBILIDADE` com o nome do colega em conflito no `detail`; `dp_folga_criar_admin` devolve `ok:false, incompatibilidade:true, colega`.
- `dp_folga_autoatribuir_competencia`: ao escolher o dia, descarta datas em conflito; sem data possível, grava o motivo em `detalhes` da execução.

Frontend:
- `DpConfiguracoesJornada.tsx`: mover `<FolgaLimitesPanel />` para depois do `SubSection` "Base Da Regra De Folgas"; passar os dias negociados efetivos (via `diasElegiveisDaConfig`) como prop `diasPermitidos`; novo quadro de corte dos vales no bloco do período usando `useDpValeRegrasEmpresa` + `periodoVaDe` de `@/lib/dp/va-calculo`; renderizar o novo `FolgaIncompatibilidadesPanel`.
- `FolgaLimitesPanel.tsx`: `diasPermitidos` filtra o `Select` de dia da semana; estado vazio quando não há dia permitido.
- Novos `src/components/dp/folgas/FolgaIncompatibilidadesPanel.tsx` e `src/hooks/useDpFolgaIncompatibilidades.tsx` (CRUD, no padrão de `useDpFolgaLimites`).
- `DpAdminCalendario.tsx` e `DpMeuCalendario.tsx`: tratar o novo erro/retorno com mensagem clara; `DpFolgas.tsx` inclui o motivo de conflito no aviso da distribuição automática.
- `src/lib/dp/folga-limites.ts`: helper puro `diasPermitidosParaLimite(cfg)`; `src/lib/dp/folga-janela.ts`: `distribuirFolgasAutomaticas` passa a receber pares incompatíveis e a descartar datas em conflito. Sem `as any`; tipos regenerados após as migrações.

Testes: filtro de dias permitidos (CLT vs. acordo com sábado), sugestão de encerramento a partir do corte dos vales (VA e VT diferentes, vales não configurados), conflito de incompatibilidade em portal/admin, distribuição automática pulando o dia em conflito e caso sem dia possível. Build, testes, lint e typecheck reais com números reportados.

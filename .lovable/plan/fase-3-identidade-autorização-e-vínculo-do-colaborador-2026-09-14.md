# Fase 3 — Identidade, autorização e vínculo do colaborador

## Diagnóstico (feito antes deste plano)

Confirmado no banco e no código:

1. `public.dp_colaborador_of(_user_id uuid)` e `public.dp_colaborador_ativo_of(_user_id uuid)` são `SECURITY DEFINER`, `search_path` fixo, executáveis por qualquer usuário logado e recebem **o id de quem se quer consultar como parâmetro**. Qualquer pessoa logada pode perguntar "qual é o colaborador deste usuário?" para um id arbitrário. Elas já barram o próprio dono/admin da empresa e já respeitam o bloqueio da Fase 1, e já falham fechado com mais de um vínculo (`count(*) = 1`), mas continuam sendo um endereço de consulta de terceiros.
2. 15 telas e hooks do portal chamam `dp_colaborador_of` passando `user.id` do navegador — o frontend é quem informa "eu sou este usuário". Hoje o valor coincide com a sessão, mas a autoridade está no lugar errado.
3. As funções com parâmetro são usadas por **21 + 16 policies** de RLS (banco e arquivos). Elas não podem ser removidas: a policy é avaliada com o papel de quem consulta, então o `EXECUTE` precisa continuar existindo.
4. `useMeuVinculoPortal` resolve o vínculo com consulta direta por `user_id`, devolve os campos certos, mas só 5 arquivos o usam. As demais telas repetem a resolução por conta própria.
5. `useDpNotificacoes` usa o **seletor administrativo de empresa** (`selectedCompanyId`) inclusive no sino do portal. Para o colaborador esse seletor não é a autoridade correta; a empresa deve vir do vínculo.
6. `DpMeuPerfil` também consulta o cadastro por `user_id` diretamente.
7. Multiempresa: hoje 7 colaboradores têm acesso, **nenhum** com dois vínculos e nenhum com dois vínculos ativos. Não existe constraint de unicidade de `user_id` em `dp_colaboradores`. Não há ambiguidade estrutural bloqueante — o comportamento hoje já é "falhar fechado quando há mais de um".
8. `PortalProtected` está fail closed (Fase 1) e o logout já faz `queryClient.clear()`.

Nada incompatível com o plano foi encontrado, então segue a implementação.

## O que vai mudar

### Banco

- Nova função sem parâmetros `public.dp_meu_colaborador()` — devolve o colaborador da própria sessão, derivado de `auth.uid()`, com as mesmas regras já aprovadas (vínculo ativo ou dentro da carência, não é dono/admin da empresa, acesso não bloqueado, falha fechado com conflito).
- Nova função `public.dp_meu_vinculo()` — devolve `colaborador_id`, `company_id`, `unidade_id`, nome, regime e situação do vínculo, também só da própria sessão.
- `dp_colaborador_of` e `dp_colaborador_ativo_of` passam a **recusar qualquer id diferente do da sessão** quando chamadas por usuário logado (o servidor continua podendo consultar outro colaborador). Assim as 37 policies continuam funcionando sem alteração e a consulta de terceiros deixa de existir.
- `EXECUTE` mínimo: nada para visitante; funções novas só para usuário logado e servidor.
- Migration nova, sem apagar dados, com rollback documentado.

### Frontend

- `useMeuVinculoPortal` passa a chamar `dp_meu_vinculo()` e vira a fonte única do contexto do colaborador, com chave de cache que inclui a identidade da sessão.
- As 15 telas/hooks do portal que hoje chamam `dp_colaborador_of` passam a usar essa fonte única. Nenhuma regra de tela muda.
- `DpMeuPerfil` passa a partir do vínculo resolvido.
- `useDpNotificacoes` ganha a variação de portal: a empresa vem do vínculo autenticado, não do seletor administrativo. O sino não é redesenhado.
- `PortalProtected` mantém o comportamento da Fase 1 e passa a negar também quando não existe vínculo, com mensagem própria.

## Testes

- Identidade: resolve o próprio vínculo; não é possível assumir outro usuário, outro colaborador ou outra empresa informando ids; sem vínculo nega; bloqueado nega; visitante nega; conflito de vínculo nega; logout limpa o contexto; login seguinte não reaproveita dados do anterior.
- Multiempresa: colaborador só vê a própria empresa; administrador continua operando a dele e não ganha acesso a outra.
- Regressão nas telas do portal: início, perfil, documentos, histórico, sindicato, rotina da loja, escala, calendário, trocas, solicitações, convocações, férias, notificações, favoritos e entrada/saída da conta.

## Verificações

TypeScript, TypeScript strict, lint, suíte completa, build, `deno check` das funções alteradas, `migrations:check`, `scope-lint`, `security-lint` (comparando com o baseline de 109) e testes de isolamento entre empresas.

## Limites desta fase

Não mexer em senha/ativação, versionamento de documentos, OCR, folgas, trocas, férias, convocações, publicação de escala nem na aparência geral. Não criar escolha de empresa no portal. Não tentar zerar o security-lint — só o que for de identidade, RPCs e permissões alteradas nesta fase. Ao terminar, entrego o relatório nos 24 itens pedidos e paro, sem iniciar a Fase 4.

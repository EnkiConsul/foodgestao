# Cargos no link de pré-admissão + rascunho da ficha de admissão

## 1. Lista de cargos vazia no convite da unidade PAKERÊ T-63

O que já foi conferido no banco: a unidade PAKERÊ T-63 existe na empresa Pakerê, tem 3 cargos vinculados (ATENDENTE, PIZZAIOLO, MOTOQUEIRO), todos ativos e não removidos, e as regras de acesso permitem a leitura desses vínculos. Ou seja, o cadastro está correto e a causa da lista vazia ainda não está comprovada — pode ser falha silenciosa ao carregar a lista, lista consultada antes de terminar de carregar, ou empresa ativa diferente no momento.

Por isso o trabalho começa por tornar a tela honesta e à prova de tela vazia:

- Enquanto a lista de cargos estiver carregando, o campo mostra "Carregando cargos…" em vez de aparecer vazio.
- Se a busca dos cargos falhar, a tela avisa o motivo e oferece "Tentar de novo", em vez de simplesmente não mostrar nada (hoje o erro é silencioso).
- Se, por qualquer motivo, nenhum cargo puder ser mostrado para a unidade escolhida, a lista passa a exibir todos os cargos da empresa com o aviso correspondente — o convite nunca trava por lista vazia.
- Registro do diagnóstico (tipo de erro, unidade e empresa) para identificar a causa real caso volte a acontecer.

Nada muda nos cadastros de cargos, unidades ou vínculos.

## 2. Rascunho da ficha de admissão (salvo no sistema, nos dois caminhos)

### Cadastro manual feito pelo gestor
- Botão "Salvar Rascunho" no formulário de admissão, além de gravação automática a cada pausa na digitação.
- O rascunho fica salvo no sistema, por empresa e por usuário, e pode ser retomado em qualquer aparelho.
- Ao reabrir o cadastro, a tela oferece "Continuar o rascunho de DD/MM às HH:MM" ou "Começar em branco" (descartar pede confirmação).
- O rascunho é apagado automaticamente quando o cadastro é concluído.
- Rascunho não vira colaborador: nenhuma validação é dispensada e nada aparece nas listas, relatórios ou pendências antes da conclusão.

### Ficha preenchida pelo candidato pelo link
- O salvamento parcial já existe. Vamos deixá-lo explícito e confiável: gravação automática ao trocar de etapa e ao pausar a digitação, aviso "Salvo às HH:MM", e recuperação clara do que já foi preenchido ao reabrir o link.
- Documentos já enviados continuam preservados.

## Detalhes técnicos

- `PreadmissaoConviteDialog.tsx`: expor `isLoading`/`isError` de `useDpCargos` e `useDpCargosDaUnidade`; fallback para todos os cargos quando a interseção resultar vazia; botão de recarregar via `refetch`; log via `notifyError`/`app_error_logs` sem toast intrusivo.
- Migration nova (reversível, com GRANTs e RLS): tabela `dp_admissao_rascunhos` (`company_id`, `user_id`, `chave` para novo/edição, `dados jsonb`, `versao`, timestamps), índice único por (`company_id`,`user_id`,`chave`), políticas restritas a `auth.uid()` + membro da empresa, gravação por RPC `dp_admissao_rascunho_salvar` idempotente com controle de versão (last-write-wins registrado) e `dp_admissao_rascunho_descartar`; auditoria de salvar/descartar.
- Hook `useDpAdmissaoRascunho` com debounce (~1,5 s), estado "Salvo às HH:MM", carregamento na abertura do `ColaboradorFormDialog` e descarte no sucesso do cadastro.
- `PreAdmissao.tsx`: reaproveitar a ação `salvar` existente para autosave com debounce e indicador de "Salvo às"; manter `versao` para evitar sobrescrita concorrente.
- Testes: cargos (carregando, erro, sem vínculo, vínculo válido), rascunho (salvar/retomar/descartar, isolamento entre empresas e entre usuários, versão concorrente), autosave do candidato.
- Validação com `bunx vitest run` e `tsgo`; provas no banco em transação desfeita; nada publicado sem seu pedido.

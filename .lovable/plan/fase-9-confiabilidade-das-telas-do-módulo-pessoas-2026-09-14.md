# Fase 9 — Confiabilidade das telas do módulo Pessoas

Diagnóstico concluído por leitura do código. A base já tem convenções boas (esqueleto de carregamento, bloco de erro com "tentar novamente", tratamento padrão de mensagens de erro, aviso de sucesso apenas após confirmação do servidor), mas elas não estão aplicadas em todas as telas. A correção é aplicar o padrão existente onde falta — sem redesenhar telas nem mudar regras.

## O que foi encontrado

### P0 — risco de falso sucesso e envio duplicado
- **Avisos (comunicação)**: ao salvar, a janela fecha no mesmo instante do clique, antes de o servidor confirmar. Se a gravação falhar, a pessoa vê a janela fechada e acredita que salvou. O botão também não fica bloqueado durante o envio, permitindo clique duplo e aviso duplicado.

### P1 — erro do servidor exibido como "nada encontrado"
Nestas telas, quando a consulta falha (inclusive falta de permissão), a tela mostra lista vazia em vez de erro, sem opção de tentar novamente:
- Convocações
- Bloqueios (regras e datas)
- Ocorrências
- Solicitações (pendentes e histórico)
- Trocas
- Pendências de cadastro
- Mural do Portal do Colaborador

### P1 — dado desatualizado ao trocar de empresa
- **Minhas Férias (portal)**: a consulta não considera a empresa ativa; para quem tem vínculo em mais de uma empresa, pode continuar mostrando os dados da empresa anterior.

### P2 — pequenos riscos de clique repetido
- **Mensagens/Modelos**: botões de salvar, duplicar e excluir sem bloqueio durante o envio; confirmar se o estado "enviando" é liberado também quando dá erro.
- **Mural**: reação, marcação de leitura e exclusão de comentário sem bloqueio durante o envio.

### Verificado e sem problema
- Atualização automática em processos de importação já para sozinha ao terminar (não há atualização infinita).
- Trocas e Minhas Trocas já bloqueiam botões durante o envio e só fecham a janela após confirmação.
- Colaboradores é a referência correta: consulta por empresa ativa, erro propagado, atualização da lista só após sucesso.
- Telas "hub" não buscam dados; nada a corrigir nelas.

## O que será corrigido

1. **Avisos**: fechar a janela e limpar o formulário somente após confirmação da gravação; manter os dados digitados em caso de falha; bloquear o botão durante o envio.
2. **Erro visível com "tentar novamente"** nas telas listadas em P1, usando o bloco de erro já existente no módulo. Erro de permissão passa a aparecer como mensagem clara, nunca como lista vazia.
3. **Distinguir vazio real de erro**: os hooks envolvidos passam a expor o erro da consulta, e as listas só mostram "nenhum registro" quando a consulta terminou com sucesso.
4. **Minhas Férias**: incluir a empresa ativa na chave da consulta, para recarregar ao trocar de empresa.
5. **Bloqueio de duplo clique** nos botões de ação de Mensagens/Modelos e Mural, e garantia de liberar o estado de envio no erro.
6. Nenhuma mudança em autorização, regras de negócio, documentos, filas ou autenticação. Nenhuma migration prevista.

## Detalhes técnicos

- Padrões reutilizados: `DpErrorState` (com `onRetry` → `refetch`), `TableSkeleton`/`CardListSkeleton` de `DpSkeletons`, `notifyError` e `toast` disparados apenas em `onSuccess`/`onError`.
- Hooks tocados: `useDpBloqueios` (expor `regrasQ.error`, `datasQ.error`, `unidadesQ.error` + `refetch`), `useDpMinhasFerias` (`queryKey: ["dp_ferias_minhas", selectedCompanyId]`), hooks das telas de Convocações/Ocorrências/Solicitações/Trocas/Pendências conforme necessário para expor `error`/`refetch`.
- Telas tocadas: `DpAvisos.tsx`, `DpConvocacoes.tsx`, `DpBloqueios.tsx`, `DpOcorrencias.tsx`, `DpSolicitacoes.tsx`, `DpTrocas.tsx`, `cadastros/DpCadastroPendenciasLista.tsx`, `DpMensagens.tsx`, `comunicacao/MuralFeed.tsx`.
- `if (error) throw error` nas consultas para que o React Query registre a falha em vez de retornar vazio; nenhum `data ?? []` como única fonte de estado vazio.

## Testes

Novos testes de componente/hook cobrindo os problemas realmente encontrados:
1. gravação falha no servidor → janela permanece aberta, dados preservados, mensagem de erro;
2. duplo clique no salvar → uma única chamada;
3. resposta lenta → botão bloqueado e estado de carregamento visível;
4. retorno vazio → mensagem de "nenhum registro" (sem erro);
5. erro de permissão → mensagem de erro, nunca lista vazia;
6. troca de empresa → recarrega e não mostra dados da empresa anterior (Minhas Férias);
7. tentar novamente após erro → nova consulta e recuperação;
8. formulário não perde dados em falha;
9. processo assíncrono de importação sai de "processando" e não fica em atualização infinita.

## Validações

TypeScript, lint, testes, build, isolamento multiempresa e verificação de segurança (baseline 63; nenhum novo apontamento). `migrations:check` apenas se surgir migration — não prevista.

## Rollback

Alterações restritas a telas e hooks do módulo Pessoas, sem migration: reverter o commit da fase restaura o comportamento anterior sem efeito no banco.

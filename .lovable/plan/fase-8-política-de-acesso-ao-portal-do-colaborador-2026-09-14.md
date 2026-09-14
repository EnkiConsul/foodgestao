# Fase 8 — Política de acesso ao Portal do Colaborador

## Diagnóstico da regra atual

A regra dos 30 dias **já existe e funciona em parte**:

- O desligamento grava uma data-limite de acesso no cadastro do colaborador (desligamento + 30 dias, padrão configurável).
- No banco, as rotinas de identidade do portal já aceitam o desligado enquanto a data-limite não passa, e negam depois dela. Bloqueio de acesso continua negando na hora, independente do prazo.
- Documentos: o desligado continua vendo e baixando os documentos dele (inclusive rescisórios publicados depois do desligamento); enviar documento novo já exige vínculo ativo.
- Folgas, trocas e novas solicitações já exigem vínculo ativo no banco: o desligado é negado mesmo chamando direto.

**Falhas encontradas:**

1. **Convocações**: responder oferta e registrar visualização aceitam quem está nos 30 dias — o desligado ainda pode aceitar trabalho.
2. **Férias**: o pedido de férias só confere se a conta é do dono do cadastro; não exige vínculo ativo — o desligado consegue pedir férias.
3. **Cancelar solicitação** e **apagar documento pendente** também aceitam quem está nos 30 dias.
4. **Comentário no mural** aceita quem está nos 30 dias.
5. **Empresa inativa / assinatura / módulo Pessoas**: nada disso é conferido no portal hoje — o portal abre mesmo com empresa desativada ou módulo desligado.
6. **Fuso horário**: o corte dos 30 dias usa a data do servidor (UTC), não o fuso da empresa; à noite no Brasil o acesso pode encerrar até 3 horas antes do previsto.
7. **Tela**: existe um aviso de "acesso encerra em X dias", mas o portal continua oferecendo os botões de folga, troca, férias e convocação para quem está nos 30 dias; a ação só falha ao ser enviada. Existe um verificador de "somente leitura" pronto no código, porém não usado em nenhuma tela.

## Decisões aprovadas nesta fase

- Assinatura vencida ou módulo Pessoas desativado **encerram o portal também para quem está nos 30 dias**.
- Nos 30 dias, o ex-colaborador **só consulta e baixa documentos**: nem cancelar pedidos, nem comentar no mural.
- O 30º dia continua sendo dia com acesso, até o fim do dia no fuso da empresa.

## O que será feito

### Decisão central no banco

Uma única rotina de decisão de acesso ao portal, usada por todo o resto, devolvendo um estado:

| Estado | Efeito |
|---|---|
| ativo | portal completo |
| desligado_no_prazo | somente documentos |
| desligado_expirado | acesso negado |
| bloqueado | acesso negado na hora |
| empresa_inativa / sem_plano / sem_modulo | acesso negado |

A decisão considera, nesta ordem: bloqueio de acesso → empresa ativa → assinatura/módulo Pessoas → vínculo ativo → data-limite dos 30 dias no fuso da empresa. Sem resposta clara, nega.

### Garantia no backend

- Um verificador de "pode agir" (exige vínculo ativo) passa a ser exigido em: responder e visualizar convocação, pedir férias, registrar ciência de férias, cancelar solicitação, apagar documento pendente próprio e comentar no mural. Vale para chamada direta às rotinas e para gravação direta nas tabelas (regras de acesso das tabelas ajustadas junto).
- Um verificador de "pode ver documentos" (aceita os 30 dias) mantém liberada a leitura e o download dos documentos próprios, com isolamento por empresa intacto. Nada muda no versionamento nem no armazenamento de arquivos.
- Todas as rotinas do portal passam a derivar identidade da sessão, como nas fases anteriores; nenhum identificador vindo do navegador vale como autoridade.

### Tela

- A porta de entrada do portal passa a ler o estado central: negado manda para o login com aviso; somente documentos entra em modo restrito.
- No modo somente documentos, as ações de folga, troca, férias, convocação e novas solicitações ficam escondidas ou desativadas, com explicação curta; documentos e histórico seguem disponíveis.
- O aviso de prazo passa a usar a data-limite calculada no servidor.

## Testes

14 cenários, todos verificados no banco (não só na tela): ativo; desligado há 1, 29, 30 e 31 dias; desligado tentando folga, férias, troca e convocação; recebimento e download de documento rescisório; documento de outra pessoa negado; bloqueado dentro dos 30 dias negado; e chamada direta às rotinas sujeita às mesmas restrições. Mais os cenários de empresa inativa, assinatura vencida e módulo desativado.

## Detalhes técnicos

- Nova função `private.dp_portal_decisao(_user_id)` retornando `(estado text, colaborador_id uuid, company_id uuid, acesso_ate date)`, com `SECURITY DEFINER`, `search_path` fixo e sem `EXECUTE` para `anon`/`authenticated`; RPC pública `dp_meu_acesso_portal()` (sem parâmetros, só a própria sessão) para o frontend.
- Novos auxiliares `private.dp_pode_agir(_user_id)` e `private.dp_pode_ver_documentos(_user_id)` derivados da decisão central; `dp_colaborador_ativo_of` passa a delegar em `dp_pode_agir`.
- Corte temporal via `(now() AT TIME ZONE coalesce(co.timezone,'America/Sao_Paulo'))::date <= c.acesso_portal_ate`, substituindo `CURRENT_DATE`.
- Rotinas ajustadas: `dp_convocacao_responder_oferta` (as duas assinaturas), `dp_convocacao_registrar_visualizacao`, `dp_ferias_solicitar`, `dp_ferias_registrar_ciencia`, `dp_solicitacao_cancelar`; policies `dp_doc_colab_cancel_pending` e `dp_comentarios_self_insert` passam a exigir `dp_pode_agir`; `dp_doc_colab_self_read` mantém `dp_pode_ver_documentos`.
- Frontend: `PortalProtected` (`src/App.tsx`) consome `dp_meu_acesso_portal`; `useCarenciaPortal` reescrito sobre a mesma RPC e aplicado em `ColaboradorShell` e nas telas de folgas, trocas, férias, convocações e solicitações.
- Testes: `supabase/tests/dp_portal_acesso.test.sql` (matriz temporal e negações) e `src/test/rls/portal_acesso_desligado.rls.test.ts`.
- Validações: TypeScript, lint, testes, build, `migrations:check`, isolamento multiempresa e security-lint (baseline 63 críticos; só itens desta fase).
- Reversão: a migração vem com script inverso restaurando as versões atuais das rotinas e policies; nenhuma coluna é apagada.

## Fora do escopo

Senha e acesso (Fases 1 e 7), versionamento e armazenamento de documentos (Fase 2), fila e OCR (Fase 6), regras de negócio de folga/troca/férias/convocação além da restrição do desligado, e UX geral.

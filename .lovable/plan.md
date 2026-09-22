# Correções Pessoas 360° — Fase 5: Escala do Mês e Operação Segura

Objetivo: fazer a geração e o ajuste da escala do mês acontecerem de uma só vez no servidor (tudo ou nada), com fila de atendimento por unidade, e fechar as gravações diretas que ainda existem em escala, trocas, convocações e ocorrências. As telas continuam iguais; muda o que o sistema aceita gravar.

## O que está frágil hoje (verificado no código e no banco)

1. **Gerar a escala do mês não é uma operação única.** Hoje o aplicativo cria a escala, apaga todos os itens do mês e reinsere em lotes de 500. Se a conexão cair ou um lote falhar no meio, a escala fica sem os dias restantes — o mês publicado pode ficar incompleto e não há volta automática.
2. **Duas pessoas gerando a escala da mesma unidade ao mesmo tempo se atropelam.** Não existe fila: uma apaga os itens enquanto a outra insere, e o resultado final é imprevisível.
3. **A regra da escala é conferida só no navegador.** A geração dos dias (turno, folga, ausência, cobertura) roda no aplicativo; o banco aceita qualquer linha que chegue. Quem tiver acesso ao aplicativo pode gravar dias fora das regras.
4. **Escala já publicada pode ser alterada por gravação direta.** Não há barreira no banco impedindo alterar os itens de uma escala publicada sem passar pela reabertura oficial.
5. **Permissões amplas sem uso.** Escala, itens de escala, trocas, convocações, ocorrências e coberturas de ocorrência ainda permitem inserir, alterar e apagar direto, embora o produto já use as rotinas de servidor (trocas e convocações são todas por rotina hoje). Visitante não autenticado também tem leitura concedida nessas tabelas.
6. **Duas rotinas ainda sem fila:** publicar o grupo de convocação e cancelar troca não tomam a trava que as demais rotinas de troca e convocação já tomam, então cliques simultâneos podem passar duas vezes.

## O que será feito

### Escala do mês em uma só operação
- Nova rotina de servidor que recebe a competência e a unidade, toma uma trava por unidade/competência, confere empresa e papel, recusa escala publicada, monta os dias segundo as regras (configuração de trabalho vigente, turno, ausências, férias) e substitui os itens do mês dentro da mesma transação: ou o mês inteiro entra, ou nada muda.
- Ajuste manual de um dia passa pela mesma rotina, com a mesma trava e as mesmas conferências, preservando a marcação de "ajuste manual".
- A tela continua com os mesmos botões (Gerar, ajustar dia, Publicar, Reabrir) e passa a mostrar mensagens de recusa em linguagem de negócio.

### Escala publicada protegida
- Barreira no banco: itens de escala publicada não mudam sem reabertura oficial. Reabrir continua registrando quem reabriu.

### Fila nas rotinas que faltam
- Publicar grupo de convocação e cancelar troca passam a tomar a trava por unidade/dia e por colaborador, igual às demais.

### Fechar gravação direta
- Escala, itens de escala, trocas, convocações, destinatários, ocorrências e coberturas de ocorrência deixam de aceitar inserir, alterar e apagar pelo aplicativo; leitura continua igual. Leitura de visitante não autenticado é removida dessas tabelas.

## Testes
- Gerar a escala com falha simulada no meio: nada é gravado, o mês anterior continua intacto.
- Duas gerações simultâneas da mesma unidade: atendidas em ordem, resultado consistente.
- Alterar item de escala publicada: negado; após reabrir, permitido.
- Ajuste manual preservado ao regerar.
- Publicar grupo de convocação e cancelar troca em duplo clique: uma única vez.
- Gravação direta em escala, itens, trocas, convocações, ocorrências e coberturas: negada.
- Outra empresa e outra unidade: negado em todos os caminhos.
- Suíte completa, tipos e conferência das rotinas no banco, com provas em transação desfeita.

## Detalhes técnicos
- Migration isolada e reversível: `dp_escala_gerar_mes(_competencia, _unidade_id, _preservar_manuais)` e `dp_escala_item_ajustar(...)` SECURITY DEFINER em `public`, apoiadas por rotinas em `private` (`dp_escala_fila`, `dp_escala_montar_mes`) com `pg_advisory_xact_lock` por `company_id|unidade_id|competencia`; portagem da lógica hoje em `src/lib/dp/escala-mes-base.ts`/`gerarEscalaMes` para o servidor, mantendo o módulo do cliente apenas para pré-visualização.
- Gatilho `trg_dp_escala_item_publicada` em `dp_escala_itens` bloqueando alteração quando a escala está publicada, com exceção para as rotinas oficiais (`dp_convocacao_sync_escala` continua funcionando).
- `REVOKE INSERT, UPDATE, DELETE` de `authenticated` e `REVOKE ALL` de `anon` em `dp_escalas`, `dp_escala_itens`, `dp_trocas`, `dp_convocacoes`, `dp_convocacao_destinatarios`, `dp_ocorrencias`, `dp_ocorrencia_coberturas`; políticas `*_admin_write`/`*_legacy` reduzidas a SELECT; `GRANT ALL` para `service_role`.
- `pg_advisory_xact_lock` adicionado em `dp_convocacao_publicar_grupo` e `dp_cancelar_troca` (chave única via `hashtextextended`).
- Frontend: `useDpEscalaMes.tsx` passa a chamar as rotinas; `mensagemErroEscala` ganha os novos motivos; testes RLS em `src/test/rls/operacoes_criticas.rls.test.ts`.
- Verificação final: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run` e provas em transação desfeita no banco.
- Nenhum dado existente é apagado; escalas e itens atuais permanecem. Ao final: parada com relatório obrigatório e sem publicar o site.

# Fase 2 — Segurança, versionamento e integridade dos documentos

## Diagnóstico (verificado agora no código e no banco)

1. **Substituição destrutiva (P0 confirmado).** Na aprovação em lote, quando existe documento igual (colaborador + tipo + competência) e a opção é "substituir", o sistema apaga o arquivo antigo e depois o registro antigo, e só então baixa/sobe o novo. Se qualquer passo seguinte falhar, o colaborador fica sem nenhum documento (`dp-doc-bulk-approve`, trecho de duplicidade).
2. **Arquivo sobrescrito.** O caminho do novo arquivo é fixo por lote/página e o envio usa sobrescrita, então reaprovar a mesma página apaga o arquivo anterior no armazenamento.
3. **Exclusão pelas telas administrativas** apaga o arquivo e o registro definitivamente, sem motivo, sem histórico e sem confirmação padronizada (documentos do colaborador e anexos).
4. **Leitura ampla de arquivos (apontamento crítico atual).** Uma regra do armazenamento libera para o colaborador qualquer arquivo cujo caminho contenha o id dele, mesmo sem existir documento correspondente, sem checar a empresa do caminho e sem checar se o documento é destinado ao portal. É o único apontamento crítico de documentos entre os 110.
5. **Sem versionamento.** A tabela de documentos não tem versão, nem ligação com o documento anterior, nem estado "substituído": o histórico existe apenas como texto na tabela de eventos.
6. **Sem controle de repetição.** Aprovar o mesmo item duas vezes ao mesmo tempo pode gravar dois documentos; não há chave de idempotência nem trava por item.
7. **O que já está correto e será preservado:** isolamento por empresa nas regras de tabela e de arquivos; documentos disciplinares restritos a dono/admin (correção anterior); bloqueio de conta já nega tudo pelo banco (Fase 1); links de arquivo são temporários (60 s a 600 s), nunca públicos.

## Tipos de documento e matriz de permissões

Os 36 tipos existentes serão agrupados em quatro classes de sensibilidade, sem criar classificação nova no banco (o tipo já existe na tabela):

| Classe | Tipos | Quem envia | Quem vê | Quem substitui | Quem exclui | Colaborador vê |
|---|---|---|---|---|---|---|
| Pagamento | contracheque, 13º, férias, adiantamento, PLR, pró-labore, informe de rendimentos, outros pagamentos | DP | DP + o próprio | DP | ninguém (só arquiva) | sim |
| Contratual/admissional | contrato, ficha de registro, admissão, termos, aviso prévio, rescisórios, sindicato, férias (aviso/recibo) | DP | DP + o próprio | DP | ninguém (só arquiva) | sim |
| Pessoal do colaborador | identidade, residência, banco, CNH, CRLV, seguro, dependente, atestado | colaborador ou DP | DP + o próprio | DP (colaborador só cancela o próprio pendente) | ninguém (só arquiva) | sim |
| Disciplinar | disciplinar | DP | somente dono/admin | DP | dono/admin | **não** |

## O que será feito

### 1. Versionamento e substituição segura
- Novas colunas na tabela de documentos: versão, documento que substitui, documento que foi substituído por, quando foi substituído, quem substituiu, estado do ciclo (em processamento / ativo / substituído / arquivado / falhou), motivo e dados do arquivamento.
- Novo fluxo, sempre nessa ordem: cria a nova versão como "em processamento" → envia o arquivo em caminho novo e único (nunca sobrescrevendo) → confere o arquivo → conclui o registro como ativo → marca a anterior como substituída. Falha em qualquer ponto deixa a anterior ativa e a nova como falhou/pendente de limpeza.
- Nunca apagar a versão anterior automaticamente.
- Backfill: todos os documentos existentes viram versão 1, ativos. Duplicidades já existentes serão apenas inventariadas e listadas no relatório, sem apagar nada.

### 2. Uma versão ativa por identidade lógica
- Índice único parcial por empresa + colaborador + tipo + competência apenas para os tipos de pagamento e contratuais com competência definida, que legitimamente têm um único documento vigente.
- Tipos que podem ter vários arquivos (atestado, identidade, dependente, outros) ficam fora da regra.

### 3. Idempotência e concorrência na importação em lote
- Reserva do item por trava no banco antes de gravar; item já importado devolve o mesmo documento em vez de criar outro.
- Chave de operação por lote + item + tentativa, para que repetir a chamada não duplique documento, arquivo nem versão.
- Falha de um item não afeta os demais (comportamento atual preservado) e passa a registrar código de erro sanitizado.

### 4. Exclusão vira arquivamento
- A ação "Excluir" nas telas administrativas passa a arquivar: o registro e o arquivo continuam, o documento sai das listas ativas, com confirmação, motivo e registro de auditoria.
- Exclusão definitiva fica disponível somente para dono/admin, com confirmação explícita e motivo, e nunca para colaborador comum. O colaborador continua podendo cancelar apenas o próprio envio ainda pendente.

### 5. Regras de acesso a arquivos
- A regra ampla de leitura do colaborador será substituída por uma que exige documento existente, da mesma empresa do caminho, do próprio colaborador e destinado ao portal — fechando o apontamento crítico.
- Regra de compatibilidade para os caminhos antigos preservada; nenhum caminho existente será movido.
- Link temporário de arquivo só é gerado depois de localizar o documento autorizado pelo id (nunca por caminho vindo da tela): expiração curta (60 s para baixar, 300 s para pré-visualizar) e o caminho interno deixa de ser devolvido às telas onde não é necessário.

### 6. Auditoria e registros
- Eventos de envio, aprovação, substituição (com documento anterior e novo), arquivamento e exclusão na tabela de eventos que já existe, sem conteúdo de arquivo, sem CPF completo, sem salário, sem link e sem token.

### 7. OCR
- Nada muda no reconhecimento nesta fase; a fila durável fica registrada como pendência da Fase 6.

## Testes

- Multiempresa e por colaborador: os 9 casos exigidos (empresa A x B, colaborador A x B, troca de identificador, caminho de outro colaborador, conta bloqueada, sem vínculo, visitante).
- Substituição: os 8 casos exigidos (versão nova ativa com anterior preservada, falha no envio, falha na gravação, falha ao concluir, aprovação repetida, duas aprovações simultâneas, histórico consultável, colaborador só vê a versão permitida).
- Armazenamento: leitura, escrita, alteração e exclusão testadas direto nos três buckets, não pela tela.
- Links temporários: os 6 casos exigidos, incluindo caminho arbitrário rejeitado e expiração.
- Regressão das telas: documentos no cadastro, portal, contracheques, férias, atestados, importação em lote, pré-visualização, filtros, download e exportação.

## Detalhes técnicos

- Tabelas tocadas: `dp_documentos` (colunas de versão/ciclo, índice único parcial, backfill), `dp_bulk_import_items` (chave de operação/reserva), `dp_documento_eventos` (novas ações).
- Funções de servidor alteradas: `dp-doc-bulk-approve` (fluxo de substituição, idempotência, trava, caminho único), `dp-doc-bulk-discard` e `dp-doc-bulk-ingest` apenas se a mudança de estados exigir.
- Nova rotina no banco para arquivar/substituir de forma atômica, chamada pelas telas e pela função de lote, com validação de papel e empresa no servidor.
- Frontend: `useDpDocumentos`, `useDpColaboradorDocumentos`, `useMeusDocumentos`, `DocDetalhesDialog` (histórico de versões), `BulkReviewInline`/`BulkReviewDialog`/`BulkImportPanel`, com os componentes padrão do módulo preservados.
- Migrations novas (nenhuma antiga editada), com backfill preservando dados, índices, grants e EXECUTE revisados, e rollback documentado — o rollback removerá apenas estrutura, nunca versões ou documentos criados na nova arquitetura.
- Validações no fim: TypeScript, TypeScript estrito, lint, testes, build, checagem das funções alteradas, validação das migrations, security-lint e scope-lint, com comparação antes/depois dos 110 apontamentos.

## Fora desta fase

Folgas, solicitações, trocas, férias, convocações, escala, fila durável de OCR e o fluxo de acesso/senha da Fase 1.

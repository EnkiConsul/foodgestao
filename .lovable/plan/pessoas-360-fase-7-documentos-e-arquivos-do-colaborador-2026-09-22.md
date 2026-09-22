# Pessoas 360 — Fase 7: Documentos e arquivos do colaborador

## Por que esta é a próxima fase

A Fase 1 protegeu o **aceite** e o **versionamento** dos documentos, mas a
gravação dos documentos em si continua aberta: hoje o aplicativo cria, altera e
apaga linhas de documentos, requisitos e checklist diretamente, sem passar por
rotina do servidor. Foi conferido no banco: `dp_documentos`,
`dp_colaborador_documentos`, `dp_documento_requisitos` e `dp_documento_eventos`
aceitam inclusão, alteração e exclusão direta pelo usuário autenticado. É a
maior exposição restante do módulo, porque envolve arquivo pessoal (LGPD),
comprovante de pagamento, atestado e contrato.

## O que muda para quem usa

- Enviar, substituir, arquivar e excluir documento do colaborador continua igual
  na tela; a conferência passa a ser feita pelo servidor.
- Documento sempre nasce vinculado à empresa e ao colaborador corretos, com
  tipo, competência e caminho de arquivo conferidos — não é mais possível
  gravar um documento apontando para o arquivo de outra empresa.
- Comprovante de pagamento: data do pagamento validada no servidor (não futura,
  dentro da competência), reassociação registrada no histórico.
- Excluir documento passa a ser exclusão lógica: sai da lista, o arquivo é
  preservado e fica guardado quem excluiu, quando e por quê.
- Checklist de admissão e catálogo de exigências só são alterados por quem
  administra a empresa.
- Clicar duas vezes não cria documento repetido.

## Escopo técnico

### Banco (uma migration, com rollback descrito)

Conferência privada `private.dp_documento_conferir`: empresa do chamador,
colaborador da empresa, requisito/tipo válido, competência no formato
`AAAA-MM`, caminho do arquivo dentro do prefixo da própria empresa, tamanho e
extensão permitidos.

Rotinas oficiais `SECURITY DEFINER` em `public` (EXECUTE só para
`authenticated` e `service_role`), todas idempotentes com trava por
colaborador+tipo+competência:

- `dp_documento_registrar` — cria o documento e o evento de histórico na mesma
  transação.
- `dp_documento_substituir` — publica nova versão preservando a anterior e os
  aceites (reaproveita as regras da Fase 1).
- `dp_documento_arquivar` / `dp_documento_excluir` — exclusão lógica com motivo
  obrigatório; arquivo do Storage preservado.
- `dp_comprovante_anexar` / `dp_comprovante_reassociar` — valida data de
  pagamento e grava histórico nos dois documentos envolvidos.
- `dp_colaborador_documento_marcar` — atualiza o checklist do colaborador
  (entregue, pendente, dispensado) conferindo o requisito.
- `dp_documento_requisito_salvar` / `_excluir` — catálogo por empresa, somente
  administrador.

Colunas novas em `dp_documentos`: `removido_em`, `removido_por`,
`removido_motivo`, com índice parcial para a listagem ativa. Nenhum documento
existente é alterado (backfill apenas de marcação).

Fechamento da gravação direta: políticas `*_admin_write` → `*_admin_read`
(somente leitura) em `dp_documentos`, `dp_colaborador_documentos`,
`dp_documento_requisitos` e `dp_documento_eventos`; `REVOKE INSERT/UPDATE/DELETE`
de `authenticated`, `REVOKE ALL` de `anon`, `GRANT ALL` para `service_role`.
A autoinserção do colaborador pelo portal continua funcionando, mas via rotina.

### Frontend (sem mudança de layout)

`src/lib/dp/documentos-oficial.ts` com as chamadas e a tradução dos erros para
linguagem de negócio. Migram de gravação direta para as rotinas:
`useDpDocumentos`, `useDpColaboradorDocumentos`, `useDpDocumentoRequisitos`,
`useDpComprovantePagamento`, `useDpFeriasDocumentos`, `useDpFichaImportacao`,
`historicoDocAcoes.ts`, `DpMeuDocumentos.tsx` e `useMeusDocumentos`. Listagens
passam a filtrar documentos removidos.

### Edge Functions

`dp-doc-bulk-approve`, `dp-doc-bulk-worker` e `dp-documento-certificado`
passam a usar as mesmas rotinas em vez de inserir direto, mantendo o
comportamento atual da importação em lote.

### Provas

Testes em `src/test/rls/` (visitante negado nas rotinas e nas tabelas) e provas
no banco em transação desfeita: criar documento, duplo clique, documento de
outra empresa recusado, arquivo de outro prefixo recusado, comprovante com data
futura recusado, substituição preservando aceite, exclusão lógica preservando
arquivo, gravação direta recusada. `bunx tsgo` e `bunx vitest run` completos.

## Fora do escopo

Módulo financeiro, publicação do site (Fases 1–6 seguem aguardando sua
decisão), cadastros auxiliares (cargos, turnos, sindicatos, benefícios).

Ao final, paro para sua conferência com o relatório da fase.

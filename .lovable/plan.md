# Corrigir o envio de CNH pelo colaborador

## O que aconteceu

O Nordman entra no sistema apenas como colaborador (não é sócio nem administrador da empresa). Verifiquei que o guarda-arquivos do sistema só autoriza a **gravação** de arquivos de documentos para quem é administrador ou dono da empresa. Quando o colaborador escolhe a foto/PDF da CNH, o arquivo é recusado antes de qualquer coisa e a tela mostra apenas uma mensagem técnica curta, sem explicação.

Também confirmei que:
- não existe nenhum documento de CNH gravado para ele;
- nenhuma ocorrência foi registrada na tela de erros, porque essa falha de envio não é reportada para a auditoria de erros — por isso ele "não soube dizer qual erro".

Ou seja: nenhum colaborador consegue enviar documentos pelo aplicativo hoje. Não é problema do arquivo dele.

## O que vou fazer

1. **Liberar o envio para o próprio colaborador**, com limites: ele só pode gravar arquivos na pasta dele, dentro da empresa dele, e apenas enquanto estiver ativo. Continua sem poder ver, alterar ou apagar arquivos de outras pessoas, e o documento continua entrando como "pendente de aprovação" para o gestor revisar.
2. **Mensagem clara em caso de falha**: em vez do texto técnico, o colaborador verá o motivo em português (arquivo muito grande, formato não aceito, sem permissão, sem internet) com orientação do que fazer.
3. **Registrar a falha na auditoria de erros**, com tela, ação, colaborador e detalhes técnicos, para que uma próxima ocorrência possa ser resolvida sem depender do relato.
4. **Testar o fluxo ponta a ponta** entrando como colaborador: enviar uma imagem e um PDF, confirmar que o documento aparece para aprovação do gestor e que a pendência da CNH é baixada.
5. Avisar o Nordman que pode tentar de novo depois do ajuste.

## Detalhes técnicos

- Nova política de `INSERT` em `storage.objects` para o bucket `dp-documentos`, restrita a `split_part(name,'/',1) = company_id` e `split_part(name,'/',2) = dp_colaborador_ativo_of(auth.uid())`; mantém `dp_doc_bucket_admin_write` e o `SELECT` atual intactos.
- `src/hooks/useDpColaboradorDocumentos.tsx` (mutation `enviar`): tradução da falha de upload/insert e chamada de `reportError` de `src/lib/errorLog.ts` com rota, ação e `colaborador_id`.
- As políticas de `dp_documentos` (`dp_doc_colab_submit`) e `dp_colaborador_documentos` (`dp_colab_doc_self_insert`) já permitem o envio pelo colaborador — só o armazenamento do arquivo estava bloqueado.
- Validação: `tsc`, testes de `src/lib/dp` e roteiro Playwright no portal do colaborador.

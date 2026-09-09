# Corrigir o nome lido do colaborador na importação de documentos

## Problema

No contracheque do Garavelo, o sistema preencheu o nome da empresa (razão social) no lugar do nome da pessoa. No documento, o nome do colaborador aparece **abaixo** do rótulo "Nome do funcionário", e a leitura atual só considera o que está na mesma linha do rótulo — pegando o texto do cabeçalho da empresa.

## O que será feito

1. **Ler o nome também na linha seguinte ao rótulo**: quando "Nome do funcionário / colaborador / empregado / sócio" estiver sozinho (rótulo de coluna), o nome é buscado na primeira linha útil abaixo dele.
2. **Nunca aceitar nome de empresa**: descartar candidatos com marcas de razão social (LTDA, EIRELI, S/A, SA, ME, MEI, EPP, "COMÉRCIO DE", "ALIMENTOS", "RESTAURANTE", "BAR", "& CIA", "MATRIZ", "FILIAL") e qualquer linha próxima ao CNPJ.
3. **Prioridade clara dos rótulos**: rótulo específico do funcionário (mesma linha ou linha abaixo) vence sempre o rótulo genérico "Nome", que hoje casa com o cabeçalho da empresa. O "Nome" genérico passa a ser usado só como último recurso e nunca quando parecer empresa.
4. **Reforçar a instrução da leitura automática** para que a linha `PESSOA:` traga o nome sob o campo do funcionário e nunca a razão social; quando houver dúvida, devolver desconhecido em vez de arriscar o nome da empresa.
5. **Cadastro rápido**: se o nome não puder ser determinado com segurança, o campo abre vazio com aviso, em vez de vir com nome errado.

## Detalhes técnicos

- Regras puras em `src/lib/dp/doc-pessoa.ts` e no espelho `supabase/functions/_shared/doc-pessoa.ts` (teste de paridade já cobre os dois).
- Nova extração por linhas: quebra do texto em linhas, detecção de rótulo isolado, varredura das próximas 3 linhas úteis, filtro de razão social e de linhas de CNPJ.
- `extrairNomePessoa` mantém a assinatura atual; sem mudanças em banco, RLS, permissões, classificação de tipo/competência ou fluxo de aprovação.
- Ajuste apenas textual do prompt em `supabase/functions/dp-doc-bulk-ingest/index.ts` (linha da instrução de `PESSOA:`).
- Páginas já lidas continuam reaproveitando o texto extraído, então o nome é recalculado sem reenviar o PDF.

## Testes

- Casos novos em `src/test/dp/docPessoa.test.ts`: nome sob rótulo isolado; razão social no cabeçalho ignorada; `PESSOA:` com razão social rejeitada; documento sem nome legível retorna vazio.
- Typecheck e suíte de DP.

## Rollback

Reverter as mudanças em `doc-pessoa.ts` (dois arquivos) e o texto do prompt; nada persistido muda.

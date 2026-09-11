# Corrigir a importação da folha de ponto da Kassiane

## Diagnóstico confirmado
- O arquivo enviado em 11/09/2026 às 01:00 (horário de São Paulo) identificou corretamente **Kassiane**, a competência **06/2026**, a natureza **Folha de Ponto** e a unidade **Pakerê Garavelo**.
- Porém, a unidade ficou registrada apenas na página processada, enquanto o cabeçalho do lote permaneceu sem unidade.
- A pendência “Unidade Não Identificada No Lote” olha somente o cabeçalho do lote e, por isso, foi exibida indevidamente mesmo com a página identificada.
- O lote ainda está em revisão, com a página pendente de aprovação. Como o documento ainda não foi efetivamente salvo no histórico da Kassiane, a pendência individual de folha de ponto também continua aberta.

## Correções
- Ao concluir a leitura de um lote, preencher automaticamente a unidade do lote quando todas as páginas identificadas apontarem para uma única unidade, incluindo a unidade obtida pelo cadastro do colaborador reconhecido.
- Na revisão manual de colaborador, copiar também a unidade desse colaborador para a página e, quando não houver conflito entre páginas, para o lote.
- Fazer a pendência de “lote sem unidade” considerar a unidade já detectada nas páginas e não gerar falso alerta quando o lote puder ser resolvido com segurança.
- Na aprovação, manter a prioridade: unidade detectada na página, unidade do lote e, como último fallback seguro, unidade principal do colaborador reconhecido.
- Após salvar, atualizar imediatamente documentos e pendências para retirar a folha de ponto de Kassiane em 06/2026 sem aguardar a rotina diária.
- Corrigir o lote atual da Kassiane para Pakerê Garavelo; ele continuará aguardando a confirmação final do gestor antes de virar documento, preservando a revisão humana.

## Segurança contra vínculo incorreto
- Só preencher automaticamente o cabeçalho quando houver uma única unidade possível.
- Se páginas reconhecidas apontarem para unidades diferentes, manter o lote multiunidade e usar a unidade individual de cada página.
- Se houver conflito ou nenhuma evidência, continuar exigindo escolha manual.

## Validação
- Testar arquivo individual com colaborador reconhecido e lote inicialmente sem unidade.
- Testar lote com vários colaboradores da mesma unidade e lote com colaboradores de unidades diferentes.
- Confirmar que o alerta de lote não identificado desaparece quando a unidade é inequívoca.
- Aprovar um documento de teste e confirmar que a pendência individual correspondente fecha imediatamente.

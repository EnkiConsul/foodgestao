# Funcionamento da unidade: por que não apareceu

## O que os prints mostram

A janela do print é a versão **anterior** do formulário de unidade, não a atual:

- título "Editar unidade" (a versão atual mostra o nome da unidade, ex. "Pakerê T-63");
- sem as abas Dados | Funcionamento;
- rodapé com "Salvar" acima de "Cancelar" (na versão atual "Cancelar" vem primeiro no celular).

O código já no projeto (`UnidadeFormDialog.tsx`) tem as abas **Dados** e **Funcionamento**, com o editor de horários dentro da segunda aba. Ou seja: o formulário está certo, o navegador estava com o pacote antigo em cache.

## Passo 1 — Confirmar (sem mudar código)

1. Recarregar a pré-visualização com cache limpo (fechar e reabrir a aba do Chrome ou puxar para atualizar).
2. Abrir Pessoas > Unidades > editar "Pakerê T-63": deve aparecer a barra de abas **Dados | Funcionamento** logo abaixo do título, que agora mostra o nome da unidade.

Se depois do recarregamento as abas continuarem ausentes, o problema é outro e eu investigo no ambiente (checagem direta da tela em execução) antes de qualquer alteração.

## Passo 2 — Deixar impossível de perder (se você quiser)

Mesmo com as abas funcionando, dá para tornar o acesso mais direto:

- Abrir o editor já na aba **Funcionamento** quando o acesso vier pelo atalho da loja (já implementado nos cards/lista/ficha de Unidades).
- Mostrar um aviso na aba Dados quando a unidade ainda não tem funcionamento configurado, com um botão "Configurar funcionamento" que muda de aba.
- No título do diálogo, um selo curto com o resumo ("Seg–Sex 08:30 → 18:30") para dar retorno imediato.

## Detalhes técnicos

- Arquivos envolvidos: `src/components/dp/UnidadeFormDialog.tsx` (abas + integração de salvamento), `src/components/dp/HorarioFuncionamentoEditor.tsx` (períodos por dia), `src/hooks/useDpFuncionamentoResumo.tsx` (resumo por unidade), `src/pages/dp/DpUnidades.tsx` (atalhos e resumo).
- Nenhuma mudança de banco é necessária: `dp_unidade_horarios_funcionamento` já aceita vários períodos por dia.
- O Passo 2 é só frontend.

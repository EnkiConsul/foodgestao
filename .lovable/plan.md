# Corrigir o botão de anexar arquivo

## Problema

Na tela de Atestados e Licenças, ao tocar em "Selecionar arquivo" nada acontece: o seletor de arquivos do celular não abre.

Causa: o botão tenta abrir o campo de arquivo escondido através de uma referência externa que pode não estar disponível no momento do toque, e o campo fica com uma técnica de ocultação que alguns navegadores móveis ignoram ao receber o clique programático.

## O que será feito

1. Tornar o botão um rótulo ligado diretamente ao campo de arquivo, para que o toque abra o seletor de forma nativa em qualquer navegador (sem depender de código).
2. Manter a referência externa funcionando (usada para limpar o campo depois do envio), combinando referência interna e externa.
3. Permitir escolher o mesmo arquivo novamente (limpando o valor a cada abertura).
4. Manter o texto com o nome do arquivo escolhido e a aparência atual.

A mesma correção vale automaticamente para a tela de Registros Disciplinares, que usa o mesmo seletor.

## Detalhes técnicos

- Arquivo: `src/components/dp/DpFilePicker.tsx`
- Usar `useRef` interno + `useImperativeHandle` para expor o input ao `forwardRef`.
- Gerar um `id` estável (`useId`) quando não houver `id`, e renderizar o botão como `<Button asChild><label htmlFor={inputId}>…</label></Button>` para ativação nativa.
- Trocar `sr-only` por input absolutamente posicionado com `opacity-0`/`pointer-events-none` mantendo-o no fluxo, e resetar `e.currentTarget.value` no `onClick` do input.
- Sem mudanças em `DpAtestados.tsx` ou `DpDisciplinar.tsx`.

## Verificação

Typecheck e teste no navegador em viewport mobile confirmando que o toque abre o seletor de arquivos e o nome escolhido aparece.

# D4 — Rótulos acessíveis no cadastro inicial (onboarding)

## O que está errado hoje

Na primeira etapa do cadastro ("Dados da Empresa"), cada campo tem um texto acima dele, mas esse texto não está ligado ao campo. Quem usa leitor de tela ouve "caixa de edição" sem saber do que se trata, e o asterisco de obrigatório não é anunciado. O bloco de endereço (CEP, rua, número, bairro, cidade, estado) já está correto e não será mexido.

## O que será feito

1. **Ligar rótulo e campo**: o componente interno de campo passa a gerar um identificador e usar `htmlFor`/`id`, valendo para nome, CNPJ, razão social, nome fantasia, segmento, telefone, WhatsApp e e-mail.
2. **Marcar obrigatórios de verdade**: os campos com asterisco recebem `aria-required="true"`, e o asterisco visual ganha o texto "obrigatório" para leitor de tela (em vez de apenas um símbolo).
3. **Anunciar o erro junto do campo**: a mensagem de erro recebe identificador próprio, é ligada ao campo (`aria-describedby`), o campo fica marcado como inválido (`aria-invalid`) e o erro é anunciado (`role="alert"`).
4. **Formulário de verdade**: a etapa passa a ser um `<form>` com envio pelo botão de avançar, para que o Enter funcione e o navegador reconheça o conjunto como formulário.
5. **Aceite dos termos**: o texto de erro do aceite passa a ser ligado à caixa de seleção e o `aria-required` é aplicado.
6. **Etapa de módulos**: conferir e ajustar os mesmos pontos (nome acessível dos cartões selecionáveis e estado de seleção anunciado).

Nada muda visualmente: mesmos textos, mesmas posições, mesmas validações e mesmas regras de negócio.

## Verificação

- Teste automatizado novo que renderiza a etapa e confirma, para cada campo, que ele é encontrado pelo rótulo, que os obrigatórios estão marcados como tais e que o erro é ligado ao campo.
- Conferência no preview com leitura da árvore de acessibilidade da tela de cadastro.
- Checagem de tipos.

## Detalhes técnicos

- `src/components/onboarding/food/StepEmpresa.tsx`: `Field` recebe `id`, `required` e `error`; usa `useId` quando o id não for informado, renderiza `<Label htmlFor>` e injeta `id`, `aria-required`, `aria-invalid`, `aria-describedby` no filho via `React.cloneElement` (ou props explícitas por campo, sem clonagem, se for mais legível). Asterisco vira `<span aria-hidden="true">*</span>` + `<span className="sr-only">obrigatório</span>`.
- `CnpjInput` e `SegmentoSelect` já aceitam `id`; passar o id gerado. `CnpjInput` ganha suporte a `aria-required` e a mesclagem do `aria-describedby` externo com o interno de erro.
- `EnderecoFields` permanece intacto (já usa `htmlFor`); apenas marcar obrigatórios se a validação do onboarding exigir CEP/número.
- `src/pages/Onboarding.tsx`: envolver a etapa 1 em `<form onSubmit>` reaproveitando o handler de avançar; botão de avançar como `type="submit"`.
- Teste em `src/test/unit/onboardingAcessibilidade.test.tsx` com Testing Library (`getByLabelText`), stubs de ResizeObserver/scrollIntoView e `QueryClientProvider`.

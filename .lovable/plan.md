## Objetivo
No cadastro da empresa (primeiro acesso), avisar imediatamente que o CNPJ é inválido, sem depender de clicar em "Avançar".

## Situação atual (verificada)
- `src/components/shared/CnpjInput.tsx` já mostra "CNPJ inválido — verifique os dígitos." **somente** quando os 14 dígitos foram digitados e os dígitos verificadores falham.
- Se o usuário digita um CNPJ incompleto (menos de 14 dígitos) e sai do campo, nenhuma mensagem aparece.
- `src/components/onboarding/food/StepEmpresa.tsx` exibe `errors.cnpj` apenas após a validação do botão "Avançar" (`validateEmpresa` em `src/pages/Onboarding.tsx`).
- O botão de busca na Receita fica desabilitado quando o CNPJ é inválido, sem explicar o motivo.

## Mudanças propostas (apenas frontend/apresentação)
1. **`CnpjInput.tsx`**
   - Controlar um estado `touched` (setado no `onBlur`).
   - Mostrar mensagem de erro quando:
     - o campo perdeu o foco e tem dígitos, mas menos de 14 → "CNPJ incompleto — informe os 14 dígitos.";
     - os 14 dígitos foram digitados e os dígitos verificadores falham → "CNPJ inválido — verifique os dígitos." (comportamento atual, mantido).
   - Marcar `aria-invalid` e borda destrutiva nesses dois casos, para acessibilidade e feedback visual consistente.
   - Associar a mensagem ao input via `aria-describedby` para leitores de tela.
   - Ajustar o `title` do botão de busca quando desabilitado por CNPJ inválido ("Informe um CNPJ válido para buscar").

2. **`StepEmpresa.tsx`**
   - Evitar mensagem duplicada: quando o `CnpjInput` já está exibindo o erro inline, não repetir o texto do `Field`. Basta priorizar uma única fonte de mensagem (o erro do `Field` continua aparecendo se o usuário tentar avançar com o campo vazio).

## Fora de escopo
Nenhuma mudança em regras de negócio, RPC de cadastro, banco de dados ou na validação do lado do servidor — apenas o feedback visual/imediato do campo.

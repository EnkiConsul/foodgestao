# Corrigir a guarda de rede da homologação

## Objetivo
Garantir que mocks e bloqueios de funções aconteçam no transporte de rede antes da criação do cliente real, sem depender do objeto temporário retornado por `cliente.functions`.

## Implementação
- Criar uma guarda `fetch` exclusiva da homologação, instalada pelo bootstrap após validar ambiente e antes de qualquer importação que crie o cliente.
- Interceptar URLs `/functions/v1/<nome>`: responder localmente às funções simuladas, permitir somente a lista explícita aprovada e negar qualquer nome desconhecido sem chamar a rede.
- Remover a interceptação de `cliente.functions.invoke`; manter no cliente apenas a proteção estável dos métodos de autenticação que enviam e-mail.
- Preservar produção sem alteração no `fetch` e manter o comportamento fail-closed já existente.

## Testes obrigatórios
- Usar `createClient` real do SDK instalado com um `fetch` espião.
- Fazer dois acessos separados a `cliente.functions.invoke`: `lookup-cnpj` e uma função desconhecida.
- Confirmar resposta simulada/bloqueada e exatamente zero chamadas ao `fetch` de rede nas duas operações.
- Confirmar que uma função aprovada chega ao transporte e que produção permanece sem interceptação.
- Rodar os testes D3 e a verificação de tipos; nada será publicado ou aplicado aos bancos.

## Arquivos previstos
- Guarda de homologação e bootstrap.
- Inicialização principal, removendo a guarda inválida do getter.
- Testes unitários D3 com o cliente real do SDK.
- Runbook D3, registrando a proteção no transporte.

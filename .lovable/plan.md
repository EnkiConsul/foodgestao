# Selo de cadastro incompleto no celular + filtro e destaque na lista

Você não viu o aviso porque ele só entrou na tabela da versão de computador — a lista em cartões do celular ficou sem. Além de corrigir isso, vai um jeito rápido de ver só os incompletos.

## 1. Selo no cartão do celular

- Cada cartão de colaborador ativo com pendências ganha o selo **"Cadastro incompleto (N)"** em âmbar, junto dos selos de vínculo e perfil.
- Tocar no cartão abre a ficha, onde já existe o aviso no topo com a lista do que falta.

## 2. Aba "Incompletos" no topo da lista

- Nova aba **Incompletos (N)** ao lado de Todos / Ativos / Desligados — um toque e a lista mostra só quem tem cadastro incompleto, ordenada por quem tem mais campos faltando primeiro.
- Desligados não entram nessa contagem (só faz sentido cobrar de quem está ativo).

## 3. Filtro visível também no celular

- O filtro "Cadastro: só cadastros incompletos" já existe, mas ficou no fim da folha de filtros e nem contava no botão "Filtros". Ele sobe para o começo da folha, passa a contar no indicador de filtros ativos e entra no "Limpar".

## Detalhes técnicos

- `src/pages/dp/DpColaboradores.tsx`: selo âmbar no bloco de badges do cartão mobile (mesma regra `faltantesDe` já usada na tabela); novo valor `incompletos` em `statusFilter` com contagem e ordenação por quantidade de campos faltando; campo "Cadastro" movido para o topo dos filtros, incluído em `activeCount` e em `onClear`.
- Sem mudanças de banco, RLS ou edge function.

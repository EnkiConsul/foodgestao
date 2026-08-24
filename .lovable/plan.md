# Convocações — Fechamento do Bloco 3 (migration M21)

Uma única migration incremental corretiva. M1–M20 permanecem intactas. Publicação, vagas, Option A, remuneração e escala não são tocadas.

## 1. Recusa sem exigência de motivo

Em `dp_convocacao_responder_oferta` (recriada com o mesmo nome, novo corpo):

- Remover a leitura de configuração usada só para a recusa, a referência ao campo inexistente `exige_motivo_recusa` e o erro `REFUSAL_REASON_REQUIRED`.
- Motivo passa a ser opcional: quando informado, é limpo de espaços e salvo; quando vazio, grava nulo.
- Transição `pendente → recusada` com data/hora da resposta, sem alterar outras ofertas.
- Idempotência preservada: repetir a recusa devolve sucesso idempotente sem novo evento nem novo timestamp.

## 2. Precedência entre prazo e início

A decisão deixa de depender da ordem das verificações e passa a comparar os dois horários persistidos (prazo de resposta e início previsto):

- Prazo menor ou igual ao início: o prazo manda. Se já passou, a oferta vira "sem resposta".
- Início antes do prazo: o início manda. Se já passou, vira "encerrada por início da ocorrência".
- Empate entre os dois: "sem resposta".
- Só um dos dois existir: usa o existente.

Em todos os casos o encerramento é materializado (data/hora do encerramento, motivo e evento de auditoria) e a função devolve JSON, sem erro que desfaça a alteração.

Cenários cobertos: prazo 10h/início 12h/agora 13h → sem resposta; início 10h/prazo 12h/agora 13h → encerrada por início; prazo igual ao início → sem resposta; início já passou e prazo futuro → encerrada por início; prazo já passou e início futuro → sem resposta.

## 3. Visualização concorrente

`dp_convocacao_registrar_visualizacao` é endurecida:

- A gravação da visualização acontece uma única vez, via atualização condicional.
- Se outra chamada simultânea venceu a corrida, a função relê o valor já gravado e retorna como idempotente, sem gerar um segundo evento e sem mudar o horário registrado.
- Retentativas não alteram o timestamp nem duplicam auditoria.

O comportamento visual do Portal não muda.

## Segurança

Mantidos: exigência de usuário autenticado, validação de que a oferta pertence ao colaborador do usuário, `SECURITY DEFINER` com `search_path` fixo, sem acesso público/anônimo, execução liberada apenas para usuários autenticados e serviço, helpers internos não expostos.

## Validação

Executar e reportar resultado real de: `npx vite build`, `npm test`, `npm run lint`, `npm run typecheck:strict`, separando falhas novas de pré-existentes.

## Aceite

Recusa com e sem motivo funcionando; os cinco cenários de precedência corretos; visualização concorrente sem evento duplicado; nenhuma regressão no aceite nem na criação única do item de escala. Depois disso, parar — Bloco 4 fora de escopo.

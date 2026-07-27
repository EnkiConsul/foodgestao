## O que está acontecendo

Ao salvar a regra de folga da unidade Garavelo, o servidor recusa a gravação com "chave duplicada" e a tela mostra "não foi possível salvar as regras".

Motivo confirmado nas requisições da sessão: a unidade Garavelo ainda **não tem regra própria**, então o sistema parte da regra padrão da empresa como base. Só que ele copia junto o **identificador interno da regra padrão** e tenta criar a nova regra da unidade com esse mesmo identificador — que já existe. O banco bloqueia e nada é salvo.

Isso afeta qualquer unidade na primeira vez que se cria uma exceção de regra; ao editar uma regra que já existe, funciona normalmente.

## Correção

Em `src/hooks/useDpConfigDp.tsx`, na mutação `save`:

1. Ao usar a regra padrão como base para uma nova exceção, remover os campos de identidade (`id`, `unidade_id`, `company_id`) antes do merge — a base deve ser apenas os valores das regras.
2. Montar o `payload` sempre a partir dos campos de regra + `company_id` da empresa ativa + `unidade_id` do alvo, garantindo que nenhum `id` herdado vá no insert.
3. No caminho de update (regra já existente), também não enviar `id` no payload — apenas filtrar pelo `id` no `.eq()`.
4. Aplicar o mesmo cuidado ao registro em `dp_regras_historico`, para que o "valor anterior" gravado contenha só os campos de regra.

## Verificação

- Salvar uma regra nova para Garavelo (unidade sem exceção): deve criar a exceção sem erro.
- Editar novamente a mesma unidade: deve atualizar a mesma linha, sem duplicar.
- Salvar a regra padrão da empresa (sem unidade): continua atualizando a linha existente.
- Conferir que o histórico de regras registra a alteração corretamente.

## Diagnóstico confirmado

O segmento **Restaurante** já existe e está ativo no banco (é o primeiro da lista, junto com outros 12). O select aparece vazio no formulário de primeiro acesso porque a tabela de segmentos **não tem nenhuma permissão de acesso concedida à API** — só existe a regra de leitura para usuários autenticados, sem o "grant" correspondente. Resultado: a consulta do formulário retorna erro de permissão e nenhuma opção é exibida.

## O que será feito

### 1. Corrigir o acesso (causa da lista vazia)
Conceder leitura da tabela de segmentos ao papel de usuário autenticado e acesso total ao papel de serviço, mantendo a regra de segurança atual (tabela é apenas catálogo público, sem dados pessoais).

### 2. Ampliar a lista de segmentos
Incluir os novos segmentos escolhidos:

- Restaurante e Similares
- Churrascaria
- Pastelaria
- Doceria / Confeitaria
- Sushi / Comida Japonesa
- Marmitaria
- Adega / Distribuidora de Bebidas
- Cozinha Industrial / Refeições Coletivas
- Quiosque / Trailer
- Empório / Mercearia
- Pub / Casa Noturna
- Hotel / Pousada com Restaurante
- Franquia de Alimentação

Nada é removido; os 13 existentes permanecem.

### 3. Reordenar por relevância
Nova ordem (mais usados primeiro), com "Outro" sempre no fim:

```text
1  Restaurante
2  Restaurante e Similares
3  Lanchonete
4  Pizzaria
5  Hamburgueria
6  Bar
7  Pub / Casa Noturna
8  Cafeteria
9  Padaria
10 Doceria / Confeitaria
11 Sorveteria / Açaiteria
12 Pastelaria
13 Churrascaria
14 Sushi / Comida Japonesa
15 Marmitaria
16 Delivery / Dark Kitchen
17 Food Truck
18 Quiosque / Trailer
19 Buffet / Casa de Eventos
20 Cozinha Industrial / Refeições Coletivas
21 Conveniência
22 Empório / Mercearia
23 Adega / Distribuidora de Bebidas
24 Hotel / Pousada com Restaurante
25 Franquia de Alimentação
99 Outro
```

### 4. Validar
Abrir o formulário de primeiro acesso no navegador e conferir que o select carrega todos os segmentos na ordem definida, com "Restaurante" no topo.

## Detalhes técnicos

- Migração: `GRANT SELECT ON public.segmentos TO authenticated` + `GRANT ALL ... TO service_role` (política `segmentos_select_authenticated` já existe e é mantida).
- Dados: inserção dos novos registros (nome, slug, ordem, ativo) e atualização do campo `ordem` dos existentes.
- Front-end: nenhuma alteração necessária — `useSegmentos.tsx` já lê `ativo = true` ordenando por `ordem`, e `SegmentoSelect.tsx` renderiza a lista.

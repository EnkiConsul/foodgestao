# Remover menções à Pakerê do sistema

## Objetivo
Retirar todas as referências à marca Pakerê do código, pois o sistema 360°FOOD será comercializado nacionalmente e não deve citar uma empresa cliente específica em texto exibido ao usuário, exemplos, comentários ou regras de marca.

## Alterações

### 1. Texto exibido ao usuário
- `src/components/dp/RemuneracaoFields.tsx` (linha 514)
  - De: `Muitas convenções (como a da Pakerê) tiram o prêmio quando há atestado.`
  - Para: `Muitas convenções tiram o prêmio quando há atestado.`

### 2. Placeholders e exemplos de cadastro
- `src/pages/dp/DpUnidades.tsx` (linha 493)
  - De: `placeholder="Ex: Pakerê Garavelo"`
  - Para: `placeholder="Ex: Unidade Garavelo"`

### 3. Comentários técnicos
- `src/pages/dp/portal/DpMeuDocumentos.tsx` (linha 43)
  - De: `// Tabs types (ordem estilo Pakere)`
  - Para: `// Tabs types (ordem padrão do portal)`
- `src/lib/dp/folga-rules.ts` (linha 1)
  - De: `// Regras de negócio para folgas — porta do Pakere para 360°FOOD.`
  - Para: `// Regras de negócio para folgas do 360°FOOD.`
- `src/components/dp/CalendarioMobileLista.tsx` (linha 48)
  - De: `* e bloqueios — inspirada no calendário do Portal do Colaborador Pakerê.`
  - Para: `* e bloqueios — inspirada no calendário do Portal do Colaborador.`

### 4. Lista de marcas preservadas
- `src/lib/titleCase.ts` (linha 7)
  - De: `* - Marcas preservadas: 360°FOOD, Pakerê, Lovable.`
  - Para: `* - Marcas preservadas: 360°FOOD, Lovable.`
- `src/lib/titleCase.ts` (linhas 20-21)
  - Remover as entradas `pakerê: "Pakerê"` e `pakere: "Pakerê"` do mapa de marcas preservadas.

### 5. Dados de teste
- `src/lib/dp/__tests__/holerite.test.ts` (linhas 12 e 56)
  - De: `empresa: "Pakerê <Garavelo>"`
  - Para: `empresa: "360°FOOD <Garavelo>"` (ou outro nome genérico da marca).

## Validação
- Re-executar a busca por "Pakerê" / "pakere" em todo o repositório para confirmar que não restam menções.
- Verificar build/lint após as alterações.
- Verificar se o teste de holerite continua passando com o novo nome genérico.

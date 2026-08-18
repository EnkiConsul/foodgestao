# Remover menção à Pakerê no campo de assiduidade

## Objetivo
Tirar a referência local `(como a da Pakerê)` da frase de ajuda do prêmio de assiduidade, pois o sistema será comercializado nacionalmente.

## Alteração
- Arquivo: `src/components/dp/RemuneracaoFields.tsx`
- Linha 514: `Muitas convenções (como a da Pakerê) tiram o prêmio quando há atestado.`
- Novo texto: `Muitas convenções tiram o prêmio quando há atestado.`
- O restante da frase permanece inalterado.

## Validação
- Buscar por outras menções à "Pakerê" no repositório para garantir que esta seja a única (ou a última) em texto exibido ao usuário.
- Verificar build/lint após a alteração.

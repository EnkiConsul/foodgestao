# Ajustes na Tela Operação

## 1. Remover a mensagem do card Folga Sócio
O card mostra a dica "Clique para ver quem está ausente". Ela sai. O card fica só com o rótulo "Folga Sócio" e o número, mantendo o clique que abre a lista.

## 2. Remover "Restaurar ordem padrão"
O botão existe nas duas abas (Dia e Mês). Ambos saem. A reordenação por arraste continua funcionando e permanece salva.

## 3. Sócio não deve entrar em Folga Padrão
Verificado: a Tamires está cadastrada com vínculo "Socio" e marcou folga (tipo normal) para hoje. Como a contagem hoje não separa sócios, ela aparece no card "Folga Padrão" — e também no card "Folga Sócio".

Correção: ausências de sócio (folga padrão, folga extra e férias) passam a contar apenas no card **Folga Sócio**. Os cards de folga padrão, folga extra e férias passam a contar somente colaboradores não sócios, e o sócio ausente deixa de aparecer nas listas por cargo/turno da rotina do dia. Sócio que não marcou nada segue fora da operação, sem contagem — como hoje.

## Detalhes técnicos
- `src/pages/dp/DpOperacaoPanorama.tsx`: remover a string do `hint` do card `folga_socio`; remover os dois blocos com o botão `restaurarOrdem` (e o helper, se ficar sem uso).
- `src/lib/dp/operacao-panorama.ts`: ao registrar pessoa com `socio = true` nas categorias `folga_padrao`, `folga_extra` e `ferias`, não incrementar `contagens` dessas categorias (a pessoa continua na lista `pessoas` para alimentar o diálogo Folga Sócio, mas é filtrada nos blocos por funcionamento/cargo).
- Verificar se o card de mês que soma folgas/férias usa as mesmas contagens, para manter coerência entre as abas.

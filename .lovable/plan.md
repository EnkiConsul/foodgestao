# Diagnóstico

A pendência "Contracheque não fechado" (`useDpPendencias.tsx`, bloco 3, linhas 118-152) só é resolvida quando existe `dp_folha_periodos` com `status='fechado'` para o mês anterior. Como importar contracheques em `/dp/documentos/contracheque` grava em `dp_documentos` (não em `dp_folha_periodos`), a Unidade Garavelo continua listada mesmo após a importação de 06/2026.

O bloco 5 (Folha de ponto, linhas 191-233) já usa a lógica correta: verifica `dp_documentos` por unidade → colaboradores da unidade → `referencia_data` no mês.

O bloco 4 (Adiantamento, linhas 154-189) tem o mesmo problema do bloco 3.

# Correção

Ajustar **blocos 3 e 4** de `src/hooks/useDpPendencias.tsx` para espelhar a lógica do bloco 5.

Para cada unidade ativa, considerar a pendência resolvida se **qualquer** das condições for verdadeira:

**Bloco 3 — Contracheque (mês anterior):**
1. Existe `dp_folha_periodos` da empresa com `tipo='contracheque_mensal'`, competência no mês anterior e `status='fechado'` (comportamento atual, mantido a nível empresa).
2. Existe pelo menos 1 `dp_documentos` com:
   - `company_id = selectedCompanyId`
   - `tipo = 'contracheque'`
   - `colaborador_id` pertencente a colaboradores daquela unidade
   - `referencia_data` entre o 1º e último dia do mês anterior

**Bloco 4 — Adiantamento (mês vigente):**
1. Existe `dp_folha_periodos` da empresa com `tipo='adiantamento'`, competência no mês vigente e `status='fechado'` (mantido).
2. Existe pelo menos 1 `dp_documentos` com `tipo='adiantamento'`, colaboradores da unidade e `referencia_data` no mês vigente.

Mantidas as demais condições de disparo (dia do mês ≥ 10 para contracheque; dia ≥ `dia_adiantamento + 5` para adiantamento).

Reaproveita a mesma query de colaboradores por unidade já usada no bloco 5.

# Escopo

- Arquivo único: `src/hooks/useDpPendencias.tsx` (blocos 3 e 4).
- Sem migrations, sem mudanças de UI, sem mudanças nos demais blocos.

# Fora de escopo

- Alterações em `/dp/folha` ou no significado de "fechar folha".
- Bloco 5 (Folha de ponto) — já usa a lógica correta.

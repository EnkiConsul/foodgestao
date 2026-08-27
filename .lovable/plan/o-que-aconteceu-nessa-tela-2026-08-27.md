# O que aconteceu nessa tela

Verifiquei os 70 itens pendentes no banco de dados. Em todos os exemplos consultados, **valor e data são idênticos** — o que mudou foi só a **descrição**:

```text
Atual (sua):  "Suplementos"                → Banco: "Compra no débito|Rp3*FIT PROD NATURAIS"
Atual (sua):  "Papelaria"                  → Banco: "Compra no débito|PAPEL.COM"
Atual (sua):  "Gatorade - Jiu-Jitsu"       → Banco: "Compra no débito|TRIX ACADEMIA"
```

Ou seja: você renomeou esses lançamentos manualmente e, numa sincronização posterior, o banco reenviou a descrição bruta original. O sistema detectou a diferença e abriu uma revisão em vez de sobrescrever seu texto em silêncio.

O problema é só de apresentação: o aviso mostra apenas valor e data (que estão iguais), então parece que "nada mudou". Se você aceitar do banco, perde sua descrição personalizada; se mantiver a atual, sua descrição fica preservada.

## Ajustes propostos no aviso

1. **Mostrar o campo que realmente mudou.** Cada item lista só os campos divergentes, em formato "antes → depois", com destaque na parte alterada:
   - Descrição: `Suplementos → Compra no débito|PAPEL.COM`
   - Valor e data aparecem apenas quando divergem.
2. **Selo do tipo de mudança** por item (Descrição / Valor / Data), para bater o olho e entender.
3. **Ações em lote**, já que são 70 itens: "Manter todas as descrições atuais" e "Aceitar todas do banco", com confirmação.
4. **Texto do cabeçalho mais claro**, explicando que renomeações manuais entram em conflito com a descrição original do banco e que manter a atual preserva seu texto.
5. **Filtro rápido** para ver só mudanças de valor/data (as que realmente afetam saldo) separadas das de descrição.

## Detalhes técnicos

- Arquivo principal: `src/components/conciliacao/OriginChangesBanner.tsx` — cálculo dos campos divergentes a partir de `previous`/`incoming`, renderização condicional e selos.
- Ações em lote chamando o `resolve` existente de `src/hooks/useOriginChanges.tsx` em sequência (RPC `resolve_transaction_origin_change` já cobre aceitar/manter); sem mudança de banco ou de regra de negócio.
- Nenhuma alteração na detecção/gravação de `transaction_origin_changes`.

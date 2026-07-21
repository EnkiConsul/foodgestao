## Diagnóstico

Comparei `src/pages/dp/portal/DpMeuCalendario.tsx` com `calendario-2.txt` (Pakere). O core funcional (fetch multiempresa, validações, realtime) já espelha a lógica original; a divergência é predominantemente **visual/estrutural** — o portal está usando os wrappers `DpPage`/`DpPageHeader`/`DpContentCard` e diálogos shadcn padrão, enquanto o original tem hero grande, cards arredondados em 2rem, sombras suaves e microtipografia própria.

Ajustes estruturais que **não** dá para copiar 1:1 (motivo técnico):
- `dp_trocas.data_original` e `dp_trocas.motivo` são `NOT NULL` — logo o botão "Trocar" precisa continuar abrindo o modal secundário (escolher a folga que se oferece). Manterei o modal, mas replicando o visual arredondado do original.
- Nomes de tabela diferentes (`dp_folgas`, `dp_solicitacoes`, `dp_datas_bloqueadas`, `dp_colaboradores`) — o RPC/queries atuais ficam, apenas o layout muda.

## Correções

### 1. `src/pages/dp/portal/DpMeuCalendario.tsx` — visual parity

- Remover `DpPage`/`DpPageHeader`/`DpContentCard`. Wrapper vira:
  ```tsx
  <div className="space-y-8 max-w-7xl mx-auto">
  ```
- Header hero (fiel ao original):
  ```tsx
  <div className="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h1 className="text-4xl font-black text-foreground flex items-center gap-4 tracking-tight">
        <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <CalendarDays className="size-7 text-primary" />
        </div>
        Meu calendário
      </h1>
      <p className="text-muted-foreground mt-2 font-medium">
        Escolha suas folgas de fim de semana.
      </p>
    </div>
    <Button variant="outline" className="rounded-full" onClick={() => navigate("/dp/meu/trocas")}>
      <ArrowLeftRight className="size-4 mr-2" /> Minhas trocas
    </Button>
  </div>
  ```
- Calendário direto no fluxo (sem `DpContentCard` em volta) usando `FolgaCalendarShared variant="full"` para casar com o container arredondado grande do original.
- Legenda inferior mantida como `<p className="text-xs text-muted-foreground">`.

### 2. Dialog do dia — visual arredondado

```tsx
<DialogContent className="max-w-md rounded-[2rem] border-none shadow-2xl p-8">
  <DialogHeader>
    <DialogTitle className="text-2xl font-black flex items-center gap-3">
      <CalendarDays className="size-6 text-primary" />
      {selectedDay && formatBR(parseYMD(selectedDay.iso))}
    </DialogTitle>
```

- Card de Status: `bg-muted/50 p-5 rounded-2xl border`.
- Cards de colaboradores: `p-3 bg-background rounded-xl border` com título "Colaboradores neste dia:" em `text-sm font-bold text-muted-foreground`.
- Botões de ação com `rounded-full` no botão trocar; botão principal full-width sem alteração de comportamento.
- Footer com botão "Fechar" no estilo brutalista do original:
  ```tsx
  <Button variant="ghost" className="uppercase tracking-[0.2em] text-[11px] font-black text-muted-foreground hover:text-foreground">
    Fechar
  </Button>
  ```

### 3. Dialog "Solicitar exceção"

- Container: `rounded-[2rem] border-none shadow-2xl p-8`.
- Título `text-2xl font-black` com `AlertCircle text-amber-500`.
- Motivo passa a ser **opcional** (removendo o `throw` de validação e enviando fallback "Solicitação de exceção (sem motivo informado)").
- Label com `<span className="text-muted-foreground text-xs font-normal">(opcional)</span>`.
- Textarea `rounded-xl`.

### 4. Dialog "Solicitar troca" (mantido por schema)

- Aplicar o mesmo tratamento visual: `rounded-[2rem] border-none shadow-2xl p-8`, título grande, inputs `rounded-xl`, botão de envio principal.
- Aviso claro quando não houver folga futura disponível (já existe, mantém texto).

### 5. Tokens

- Substituir cores hard-coded (`text-slate-*`, `bg-slate-*`) por tokens semânticos (`text-foreground`, `text-muted-foreground`, `bg-muted`, `border`) mantendo o mesmo efeito visual, para respeitar o design system 360°FOOD (regra do projeto).

## Fora de escopo

- Reversão para os nomes de tabela do Pakere (`folgas`, `profiles.folga_fixa_semana`, etc.) — quebra a arquitetura multiempresa atual.
- Trocar `dp_trocas` para o fluxo 1-click sem escolher folga oferecida — proibido pelo schema (`data_original NOT NULL`).
- Alteração do `FolgaCalendarShared` (ele já reproduz a grade do original).
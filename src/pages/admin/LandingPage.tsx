import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import {
  useAllLandingContent,
  useUpsertLandingSection,
  useResetLandingSection,
} from "@/hooks/useLandingContent";
import { LANDING_DEFAULTS, type LandingSection } from "@/lib/landing-defaults";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

/* ---------- helpers de UI ---------- */

function TextField({
  label, value, onChange, multiline, rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {multiline ? (
        <Textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={rows} />
      ) : (
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function StringListEditor({
  label, items, onChange,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={it}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus className="h-4 w-4 mr-1" /> Adicionar
      </Button>
    </div>
  );
}

function ObjectListEditor<T extends Record<string, string>>({
  label, items, onChange, fields, emptyItem,
}: {
  label: string;
  items: T[];
  onChange: (v: T[]) => void;
  fields: { key: keyof T; label: string; multiline?: boolean }[];
  emptyItem: T;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="space-y-3">
        {items.map((it, i) => (
          <Card key={i} className="border-border/60">
            <CardContent className="space-y-2 p-3">
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {fields.map((f) => (
                <TextField
                  key={String(f.key)}
                  label={f.label}
                  value={(it[f.key] as string) ?? ""}
                  multiline={f.multiline}
                  onChange={(v) => {
                    const next = [...items];
                    next[i] = { ...next[i], [f.key]: v } as T;
                    onChange(next);
                  }}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, { ...emptyItem }])}>
        <Plus className="h-4 w-4 mr-1" /> Adicionar
      </Button>
    </div>
  );
}

/* ---------- editor genérico por seção ---------- */

function SectionEditor<S extends LandingSection>({
  section, value, render,
}: {
  section: S;
  value: (typeof LANDING_DEFAULTS)[S];
  render: (
    state: (typeof LANDING_DEFAULTS)[S],
    update: <K extends keyof (typeof LANDING_DEFAULTS)[S]>(key: K, v: (typeof LANDING_DEFAULTS)[S][K]) => void,
  ) => React.ReactNode;
}) {
  const [state, setState] = useState(value);
  useEffect(() => setState(value), [value]);
  const upsert = useUpsertLandingSection();
  const reset = useResetLandingSection();

  const update = <K extends keyof typeof state>(key: K, v: (typeof state)[K]) =>
    setState((s) => ({ ...s, [key]: v }));

  return (
    <div className="space-y-4">
      {render(state, update)}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => {
            if (confirm("Restaurar o texto padrão desta seção?")) {
              reset.mutate(section, {
                onSuccess: () => setState(LANDING_DEFAULTS[section]),
              });
            }
          }}
          disabled={reset.isPending}
        >
          <RotateCcw className="h-4 w-4 mr-2" /> Restaurar padrão
        </Button>
        <Button
          onClick={() => upsert.mutate({ section, content: state })}
          disabled={upsert.isPending}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}

/* ---------- página ---------- */

export default function AdminLandingPage() {
  const { data, isLoading } = useAllLandingContent();

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title="Landing Page" description="Edite os textos da página pública." />
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Landing Page"
        description="Edite os textos exibidos na página pública. Cores, ícones e layout permanecem no código."
      />

      <Tabs defaultValue="hero" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="hero">Hero</TabsTrigger>
          <TabsTrigger value="personas_strip">Faixa</TabsTrigger>
          <TabsTrigger value="comparison">Comparativo</TabsTrigger>
          <TabsTrigger value="persona_cards">Personas</TabsTrigger>
          <TabsTrigger value="features">Recursos</TabsTrigger>
          <TabsTrigger value="guarantee">Garantia</TabsTrigger>
          <TabsTrigger value="loyalty">Fidelidade 360</TabsTrigger>
          <TabsTrigger value="pricing_intro">Planos (intro)</TabsTrigger>
          <TabsTrigger value="plan_matrix">Comparativo de planos</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>

          <TabsTrigger value="final_cta">CTA final</TabsTrigger>
          <TabsTrigger value="footer">Rodapé</TabsTrigger>
        </TabsList>

        <TabsContent value="hero">
          <SectionEditor
            section="hero"
            value={data.hero}
            render={(s, u) => (
              <>
                <TextField label="Badge superior" value={s.badge} onChange={(v) => u("badge", v)} />
                <div className="grid sm:grid-cols-3 gap-3">
                  <TextField label="Título — antes do destaque" value={s.title_prefix} onChange={(v) => u("title_prefix", v)} />
                  <TextField label="Título — destaque (azul)" value={s.title_highlight} onChange={(v) => u("title_highlight", v)} />
                  <TextField label="Título — depois do destaque" value={s.title_suffix} onChange={(v) => u("title_suffix", v)} />
                </div>
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <StringListEditor label="Bullets de garantia" items={s.bullets} onChange={(v) => u("bullets", v)} />
                <div className="grid sm:grid-cols-2 gap-3">
                  <TextField label="Botão primário" value={s.cta_primary} onChange={(v) => u("cta_primary", v)} />
                  <TextField label="Botão secundário" value={s.cta_secondary} onChange={(v) => u("cta_secondary", v)} />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <TextField label="Selo: satisfação" value={s.trust_satisfaction} onChange={(v) => u("trust_satisfaction", v)} />
                  <TextField label="Selo: usuários" value={s.trust_users} onChange={(v) => u("trust_users", v)} />
                  <TextField label="Selo: dispositivos" value={s.trust_devices} onChange={(v) => u("trust_devices", v)} />
                </div>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="personas_strip">
          <SectionEditor
            section="personas_strip"
            value={data.personas_strip}
            render={(s, u) => (
              <>
                <TextField label="Rótulo" value={s.label} onChange={(v) => u("label", v)} />
                <StringListEditor label="Tags" items={s.items} onChange={(v) => u("items", v)} />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="comparison">
          <SectionEditor
            section="comparison"
            value={data.comparison}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <div className="grid sm:grid-cols-3 gap-3">
                  <TextField label="Coluna 1" value={s.col_resource} onChange={(v) => u("col_resource", v)} />
                  <TextField label="Coluna 2 (Planilha)" value={s.col_spreadsheet} onChange={(v) => u("col_spreadsheet", v)} />
                  <TextField label="Coluna 3 (Plin)" value={s.col_plin} onChange={(v) => u("col_plin", v)} />
                </div>
                <ObjectListEditor
                  label="Linhas da tabela"
                  items={s.rows}
                  onChange={(v) => u("rows", v)}
                  emptyItem={{ k: "", a: "", b: "" }}
                  fields={[
                    { key: "k", label: "Recurso" },
                    { key: "a", label: "Planilha" },
                    { key: "b", label: "360°FOOD" },
                  ]}
                />
                <TextField label="Rótulo do botão" value={s.cta_label} onChange={(v) => u("cta_label", v)} />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="persona_cards">
          <SectionEditor
            section="persona_cards"
            value={data.persona_cards}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <div className="space-y-3">
                  <Label className="text-xs">Cards (3 personas — não adicione/remova)</Label>
                  {s.cards.map((card, i) => (
                    <Card key={i} className="border-border/60">
                      <CardContent className="space-y-2 p-3">
                        <div className="text-xs text-muted-foreground">Persona: <b>{card.persona.toUpperCase()}</b></div>
                        <TextField label="Tag" value={card.tag} onChange={(v) => {
                          const next = [...s.cards]; next[i] = { ...next[i], tag: v }; u("cards", next);
                        }} />
                        <TextField label="Título" value={card.title} onChange={(v) => {
                          const next = [...s.cards]; next[i] = { ...next[i], title: v }; u("cards", next);
                        }} />
                        <StringListEditor label="Bullets" items={card.bullets} onChange={(v) => {
                          const next = [...s.cards]; next[i] = { ...next[i], bullets: v }; u("cards", next);
                        }} />
                        <TextField label="Rótulo do botão" value={card.cta_label} onChange={(v) => {
                          const next = [...s.cards]; next[i] = { ...next[i], cta_label: v }; u("cards", next);
                        }} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="features">
          <SectionEditor
            section="features"
            value={data.features}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <ObjectListEditor
                  label="Cards de recursos"
                  items={s.items}
                  onChange={(v) => u("items", v)}
                  emptyItem={{ title: "", desc: "" }}
                  fields={[
                    { key: "title", label: "Título" },
                    { key: "desc", label: "Descrição", multiline: true },
                  ]}
                />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="guarantee">
          <SectionEditor
            section="guarantee"
            value={data.guarantee}
            render={(s, u) => (
              <>
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <TextField label="Rótulo do botão" value={s.cta_label} onChange={(v) => u("cta_label", v)} />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="loyalty">
          <SectionEditor
            section="loyalty"
            value={data.loyalty}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} multiline />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <ObjectListEditor
                  label="Passos do programa"
                  items={s.steps}
                  onChange={(v) => u("steps", v)}
                  emptyItem={{ title: "", desc: "" }}
                  fields={[
                    { key: "title", label: "Título" },
                    { key: "desc", label: "Descrição", multiline: true },
                  ]}
                />
                <TextField label="Título da linha do tempo" value={s.timeline_title} onChange={(v) => u("timeline_title", v)} />
                <TextField label="Aviso legal do programa" value={s.timeline_note} onChange={(v) => u("timeline_note", v)} multiline rows={5} />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="pricing_intro">
          <SectionEditor
            section="pricing_intro"
            value={data.pricing_intro}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <div className="grid sm:grid-cols-2 gap-3">
                  <TextField label="Aba: Financeiro" value={s.tab_financeiro} onChange={(v) => u("tab_financeiro", v)} />
                  <TextField label="Aba: Departamento Pessoal" value={s.tab_dp} onChange={(v) => u("tab_dp", v)} />
                </div>
                <TextField label="DP — título" value={s.dp_title} onChange={(v) => u("dp_title", v)} />
                <TextField label="DP — texto" value={s.dp_subtitle} onChange={(v) => u("dp_subtitle", v)} multiline />
                <TextField label="DP — rótulo do botão" value={s.dp_cta_label} onChange={(v) => u("dp_cta_label", v)} />
                <TextField label="Aviso legal dos planos" value={s.legal} onChange={(v) => u("legal", v)} multiline rows={4} />
                <p className="text-xs text-muted-foreground">
                  Os cards de planos são editados em <b>Planos</b>.
                </p>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="plan_matrix">
          <SectionEditor
            section="plan_matrix"
            value={data.plan_matrix}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <TextField label="Cabeçalho da 1ª coluna" value={s.col_resource} onChange={(v) => u("col_resource", v)} />
                <p className="text-xs text-muted-foreground">
                  As linhas do comparativo são geradas a partir dos limites cadastrados em <b>Planos</b>.
                </p>
              </>
            )}
          />
        </TabsContent>


        <TabsContent value="faq">
          <SectionEditor
            section="faq"
            value={data.faq}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <ObjectListEditor
                  label="Perguntas e respostas"
                  items={s.items}
                  onChange={(v) => u("items", v)}
                  emptyItem={{ q: "", a: "" }}
                  fields={[
                    { key: "q", label: "Pergunta" },
                    { key: "a", label: "Resposta", multiline: true },
                  ]}
                />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="final_cta">
          <SectionEditor
            section="final_cta"
            value={data.final_cta}
            render={(s, u) => (
              <>
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <TextField label="Rótulo do botão" value={s.cta_label} onChange={(v) => u("cta_label", v)} />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="footer">
          <SectionEditor
            section="footer"
            value={data.footer}
            render={(s, u) => (
              <>
                <TextField
                  label="Copyright (use {year} para o ano atual)"
                  value={s.copyright}
                  onChange={(v) => u("copyright", v)}
                />
                <div className="grid sm:grid-cols-3 gap-3">
                  <TextField label="Link: Entrar" value={s.link_login} onChange={(v) => u("link_login", v)} />
                  <TextField label="Link: Planos" value={s.link_plans} onChange={(v) => u("link_plans", v)} />
                  <TextField label="Link: FAQ" value={s.link_faq} onChange={(v) => u("link_faq", v)} />
                </div>
                <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border/60">
                  <TextField label="Link: Privacidade" value={s.link_privacy} onChange={(v) => u("link_privacy", v)} />
                  <TextField label="Link: Termos" value={s.link_terms} onChange={(v) => u("link_terms", v)} />
                  <TextField label="Link: Cookies" value={s.link_cookies} onChange={(v) => u("link_cookies", v)} />
                  <TextField label="Link: Gerenciar cookies" value={s.link_cookie_settings} onChange={(v) => u("link_cookie_settings", v)} />
                  <TextField label="Link: Encarregado (DPO)" value={s.link_dpo} onChange={(v) => u("link_dpo", v)} />
                </div>
              </>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

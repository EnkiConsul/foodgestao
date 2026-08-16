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
          <TabsTrigger value="pain">Dor & Ganho</TabsTrigger>
          <TabsTrigger value="segments">Segmentos</TabsTrigger>
          <TabsTrigger value="solutions">Soluções</TabsTrigger>
          <TabsTrigger value="features">Recursos</TabsTrigger>
          <TabsTrigger value="how_it_works">Como funciona</TabsTrigger>
          <TabsTrigger value="trust">Confiança</TabsTrigger>
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

        <TabsContent value="pain">
          <SectionEditor
            section="pain"
            value={data.pain}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <TextField label="Título da coluna de dores" value={s.pain_title} onChange={(v) => u("pain_title", v)} />
                    <StringListEditor label="Dores" items={s.pains} onChange={(v) => u("pains", v)} />
                  </div>
                  <div className="space-y-2">
                    <TextField label="Título da coluna de ganhos" value={s.gain_title} onChange={(v) => u("gain_title", v)} />
                    <StringListEditor label="Ganhos" items={s.gains} onChange={(v) => u("gains", v)} />
                  </div>
                </div>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="segments">
          <SectionEditor
            section="segments"
            value={data.segments}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <ObjectListEditor
                  label="Segmentos"
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

        <TabsContent value="solutions">
          <SectionEditor
            section="solutions"
            value={data.solutions}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <div className="space-y-3">
                  <Label className="text-xs">Abas de solução (não altere a chave técnica)</Label>
                  {s.tabs.map((tab, i) => {
                    const setTab = (patch: Partial<typeof tab>) => {
                      const next = [...s.tabs];
                      next[i] = { ...next[i], ...patch };
                      u("tabs", next);
                    };
                    return (
                      <Card key={tab.key} className="border-border/60">
                        <CardContent className="space-y-2 p-3">
                          <div className="text-xs text-muted-foreground">
                            Chave: <b>{tab.key}</b>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-3">
                            <TextField label="Rótulo da aba" value={tab.tab_label} onChange={(v) => setTab({ tab_label: v })} />
                            <TextField label="Badge" value={tab.badge} onChange={(v) => setTab({ badge: v })} />
                          </div>
                          <TextField label="Título" value={tab.title} onChange={(v) => setTab({ title: v })} />
                          <TextField label="Subtítulo" value={tab.subtitle} onChange={(v) => setTab({ subtitle: v })} multiline />
                          <StringListEditor label="Bullets" items={tab.bullets} onChange={(v) => setTab({ bullets: v })} />
                          <TextField label="Rótulo do botão" value={tab.cta_label} onChange={(v) => setTab({ cta_label: v })} />
                        </CardContent>
                      </Card>
                    );
                  })}
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

        <TabsContent value="how_it_works">
          <SectionEditor
            section="how_it_works"
            value={data.how_it_works}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <TextField label="Subtítulo" value={s.subtitle} onChange={(v) => u("subtitle", v)} multiline />
                <ObjectListEditor
                  label="Passos"
                  items={s.steps}
                  onChange={(v) => u("steps", v)}
                  emptyItem={{ title: "", desc: "" }}
                  fields={[
                    { key: "title", label: "Título" },
                    { key: "desc", label: "Descrição", multiline: true },
                  ]}
                />
                <TextField label="Observação final" value={s.note} onChange={(v) => u("note", v)} multiline />
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="trust">
          <SectionEditor
            section="trust"
            value={data.trust}
            render={(s, u) => (
              <>
                <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => u("eyebrow", v)} />
                <TextField label="Título" value={s.title} onChange={(v) => u("title", v)} />
                <ObjectListEditor
                  label="Itens de confiança"
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

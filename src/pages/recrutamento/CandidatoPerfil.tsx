import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, LogOut, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maskCpf } from "@/lib/cpf";
import {
  AREAS, TURNOS, MAX_AREAS, MAX_EXPERIENCIAS, alternarArea, chamarAuthCandidato, destinoSeguro, type Experiencia,
} from "@/lib/recrutamento/candidato";
import assinatura360 from "@/assets/aveto360-assinatura.png.asset.json";

const ESCOLARIDADE = [
  "Fundamental incompleto", "Fundamental completo", "Médio incompleto", "Médio completo",
  "Técnico", "Superior incompleto", "Superior completo",
];
const soDigitos = (s: string) => s.replace(/\D+/g, "");

interface Perfil {
  nome: string; cidade: string | null; bairro: string | null; areas: string[]; turnos: string[];
  fins_de_semana: boolean | null; escolaridade: string | null; experiencias: Experiencia[]; whatsapp: string;
}

function useSessao() {
  const [estado, setEstado] = useState<"carregando" | "sem" | "com">("carregando");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEstado(data.user ? "com" : "sem"));
  }, []);
  return estado;
}

function AtivarPerfil({ onAtivado }: { onAtivado: () => void }) {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [nasc, setNasc] = useState("");
  const [wa, setWa] = useState("");
  const [aceite, setAceite] = useState(false);
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setErro(null); setCarregando(true);
    try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : "Erro inesperado."); } finally { setCarregando(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Ative seu perfil de candidato</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Você já tem acesso à AVETO. Suas candidaturas ficam privadas: sua empresa atual não vê para onde você se candidata.
        </p>
        {msg && <p role="status" className="rounded-md bg-muted p-3 text-sm">{msg}</p>}
        {erro && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
        {!desafio ? (
          <>
            <div className="space-y-1.5"><Label htmlFor="an">Nome completo</Label><Input id="an" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="ac">CPF</Label>
              <Input id="ac" inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} />
              <p className="text-xs text-muted-foreground">Se você é colaborador, usamos o CPF já cadastrado pela empresa.</p>
            </div>
            <div className="space-y-1.5"><Label htmlFor="ad">Data de nascimento</Label><Input id="ad" type="date" value={nasc} onChange={(e) => setNasc(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="aw">WhatsApp com DDD</Label><Input id="aw" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} /></div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5" />
              <span>Declaro que os dados são verdadeiros e autorizo seu uso para processos seletivos.</span>
            </label>
            <Button className="w-full h-11" disabled={carregando || !aceite || nome.trim().length < 5 || !nasc || soDigitos(wa).length < 10}
              onClick={() => run(async () => {
                const r = await chamarAuthCandidato<{ desafio_id: string; final: string }>({
                  acao: "vincular_iniciar", nome: nome.trim(), data_nascimento: nasc, whatsapp: wa, aceite: true,
                  ...(soDigitos(cpf).length === 11 ? { cpf: soDigitos(cpf) } : {}),
                });
                setDesafio(r.desafio_id); setMsg(`Enviamos um código para o WhatsApp terminado em ${r.final}.`);
              })}>
              {carregando && <Loader2 className="h-4 w-4 animate-spin" />} Receber código no WhatsApp
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="acod">Código</Label>
              <Input id="acod" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo}
                onChange={(e) => setCodigo(soDigitos(e.target.value).slice(0, 6))} />
            </div>
            <Button className="w-full h-11" disabled={carregando || codigo.length !== 6}
              onClick={() => run(async () => {
                await chamarAuthCandidato({ acao: "vincular_concluir", desafio_id: desafio, codigo });
                onAtivado();
              })}>
              {carregando && <Loader2 className="h-4 w-4 animate-spin" />} Ativar perfil
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function CandidatoPerfil() {
  const sessao = useSessao();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const voltar = params.get("voltar");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["recrutamento-meu-perfil"],
    enabled: sessao === "com",
    queryFn: async () => {
      const { data, error } = await supabase.from("recrutamento_candidatos")
        .select("nome, cidade, bairro, areas, turnos, fins_de_semana, escolaridade, experiencias, whatsapp").maybeSingle();
      if (error) throw error;
      return data as unknown as Perfil | null;
    },
  });

  const [f, setF] = useState<Perfil | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (q.data) setF({ ...q.data, experiencias: Array.isArray(q.data.experiencias) ? q.data.experiencias : [] }); }, [q.data]);

  if (sessao === "sem") return <Navigate to={`/candidato/entrar${voltar ? `?voltar=${encodeURIComponent(voltar)}` : ""}`} replace />;

  const salvar = async () => {
    if (!f) return;
    if (f.areas.length === 0) { toast.error("Escolha ao menos uma área de interesse."); return; }
    setSalvando(true);
    const exps = f.experiencias.filter((e) => e.funcao.trim() || e.local.trim()).map((e) => ({
      funcao: e.funcao.trim().slice(0, 80), local: e.local.trim().slice(0, 80), periodo: e.periodo.trim().slice(0, 40),
    }));
    const { error } = await supabase.from("recrutamento_candidatos").update({
      cidade: f.cidade?.trim() || null, bairro: f.bairro?.trim() || null, areas: f.areas, turnos: f.turnos,
      fins_de_semana: f.fins_de_semana, escolaridade: f.escolaridade, experiencias: exps,
    }).not("id", "is", null);
    setSalvando(false);
    if (error) { toast.error(error.message || "Não foi possível salvar."); return; }
    toast.success("Perfil salvo.");
    qc.invalidateQueries({ queryKey: ["recrutamento-meu-perfil"] });
    if (voltar) navigate(destinoSeguro(voltar));
  };

  const sair = async () => { await supabase.auth.signOut(); navigate("/candidato/entrar", { replace: true }); };

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-6">
      <Helmet><title>Meu perfil — AVETO Recrutamento 360</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto w-full max-w-xl space-y-5">
        <div className="flex items-center justify-between gap-2">
          <img src={assinatura360.url} alt="AVETO 360" className="h-7 w-auto" />
          <Button variant="ghost" size="sm" onClick={sair}><LogOut className="h-4 w-4" /> Sair</Button>
        </div>

        {(sessao === "carregando" || q.isLoading) && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {q.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar seu perfil. Recarregue a página.</p>}
        {q.isSuccess && !q.data && <AtivarPerfil onAtivado={() => qc.invalidateQueries({ queryKey: ["recrutamento-meu-perfil"] })} />}

        {f && (
          <>
            <div>
              <h1 className="text-xl font-semibold">Olá, {f.nome.split(" ")[0]}</h1>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" /> WhatsApp verificado (final {f.whatsapp.slice(-4)})
              </p>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Áreas de interesse</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Escolha até {MAX_AREAS}. ({f.areas.length}/{MAX_AREAS})</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {AREAS.map((a) => {
                    const on = f.areas.includes(a.id);
                    const bloq = !on && f.areas.length >= MAX_AREAS;
                    return (
                      <Button key={a.id} type="button" variant={on ? "default" : "outline"} disabled={bloq}
                        className="h-11 justify-start" aria-pressed={on}
                        onClick={() => setF({ ...f, areas: alternarArea(f.areas, a.id) })}>
                        {a.rotulo}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Onde você mora</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="cid">Cidade</Label>
                  <Input id="cid" maxLength={80} value={f.cidade ?? ""} onChange={(e) => setF({ ...f, cidade: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="bai">Bairro</Label>
                  <Input id="bai" maxLength={80} value={f.bairro ?? ""} onChange={(e) => setF({ ...f, bairro: e.target.value })} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Disponibilidade</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {TURNOS.map((t) => {
                    const on = f.turnos.includes(t.id);
                    return (
                      <Button key={t.id} type="button" variant={on ? "default" : "outline"} className="h-11" aria-pressed={on}
                        onClick={() => setF({ ...f, turnos: on ? f.turnos.filter((x) => x !== t.id) : [...f.turnos, t.id] })}>
                        {t.rotulo}
                      </Button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={f.fins_de_semana === true} onCheckedChange={(v) => setF({ ...f, fins_de_semana: v === true })} />
                  Posso trabalhar aos fins de semana
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Escolaridade</CardTitle></CardHeader>
              <CardContent>
                <Select value={f.escolaridade ?? ""} onValueChange={(v) => setF({ ...f, escolaridade: v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{ESCOLARIDADE.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Experiências</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {f.experiencias.length === 0 && <p className="text-sm text-muted-foreground">Opcional. Conte onde já trabalhou.</p>}
                {f.experiencias.map((e, i) => (
                  <div key={i} className="space-y-2 rounded-md border p-3">
                    <Input placeholder="Função (ex.: auxiliar de cozinha)" maxLength={80} value={e.funcao}
                      onChange={(ev) => setF({ ...f, experiencias: f.experiencias.map((x, j) => j === i ? { ...x, funcao: ev.target.value } : x) })} />
                    <Input placeholder="Onde" maxLength={80} value={e.local}
                      onChange={(ev) => setF({ ...f, experiencias: f.experiencias.map((x, j) => j === i ? { ...x, local: ev.target.value } : x) })} />
                    <div className="flex gap-2">
                      <Input placeholder="Período (ex.: 2023 a 2025)" maxLength={40} value={e.periodo}
                        onChange={(ev) => setF({ ...f, experiencias: f.experiencias.map((x, j) => j === i ? { ...x, periodo: ev.target.value } : x) })} />
                      <Button variant="ghost" size="icon" aria-label="Remover experiência"
                        onClick={() => setF({ ...f, experiencias: f.experiencias.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
                {f.experiencias.length < MAX_EXPERIENCIAS && (
                  <Button variant="outline" className="w-full" onClick={() => setF({ ...f, experiencias: [...f.experiencias, { funcao: "", local: "", periodo: "" }] })}>
                    <Plus className="h-4 w-4" /> Adicionar experiência
                  </Button>
                )}
              </CardContent>
            </Card>

            <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
              <Button className="w-full h-11" disabled={salvando} onClick={salvar}>
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar perfil
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

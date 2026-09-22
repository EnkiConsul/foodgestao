/**
 * Convite de Pré-Admissão: o gestor informa o essencial e recebe o link único
 * para enviar ao candidato pelo WhatsApp. O link aparece uma vez — depois só é
 * possível gerar um novo (o anterior deixa de valer).
 *
 * O CPF é pedido aqui: com ele o servidor recusa o convite quando a pessoa já
 * está cadastrada ou já tem uma ficha em andamento. A duplicidade é conferida
 * outra vez antes da efetivação.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpCargos, useDpCargosDaUnidade, useDpUnidades } from "@/hooks/useDpCadastros";
import { REGIMES_ADMISSAO } from "@/lib/dp/regimesAdmissao";
import { isValidCpf, maskCpf } from "@/lib/cpf";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPreadmissaoConvite } from "@/hooks/dp/useDpPreadmissoes";
import { notifyError } from "@/lib/notifyError";
import { reportError } from "@/lib/errorLog";
import { listaCargosDaUnidade } from "@/lib/dp/cargos-unidade";
import { mensagemOrigemApoio, vincularOrigemApoio } from "@/lib/dp/apoio-origem";
import { useDpAdmissaoRascunho } from "@/hooks/useDpAdmissaoRascunho";
import {
  camposDoRascunhoConvite,
  chaveRascunhoConvite,
  conteudoRascunhoConvite,
  rotuloRascunho,
  rotuloSalvoEm,
  type CamposRascunhoConvite,
} from "@/lib/dp/admissao-rascunho";

/** Dados já conhecidos da pessoa (promoção de folguista / pessoa em teste). */
export interface ConviteInicial {
  nome?: string | null;
  whatsapp?: string | null;
  cpf?: string | null;
  cargoId?: string | null;
  unidadeId?: string | null;
  /** Quando o convite nasce de alguém do banco de folguistas. */
  pessoaApoioId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inicial?: ConviteInicial | null;
}

export function PreadmissaoConviteDialog({ open, onOpenChange, inicial }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const { data: cargos = [], isLoading: carregandoCargos, isError: erroCargos, refetch: recarregarCargos } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const { criar } = useDpPreadmissaoConvite();
  // Rascunho do convite: guardado por empresa e por usuário, para o gestor
  // fechar a janela e retomar depois sem perder o que digitou.
  const chaveRascunho = chaveRascunhoConvite({ pessoaApoioId: inicial?.pessoaApoioId ?? null });
  const rascunho = useDpAdmissaoRascunho(chaveRascunho);
  const [rascunhoGuardado, setRascunhoGuardado] = useState<{ campos: CamposRascunhoConvite; em: string } | null>(null);


  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cargoId, setCargoId] = useState<string>("");
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [cpf, setCpf] = useState("");
  const [regime, setRegime] = useState<string>("");
  /** Decisão obrigatória: sem escolha o convite não é criado. */
  const [apos22h, setApos22h] = useState<"" | "sim" | "nao">("");
  const [dias, setDias] = useState("7");
  const [link, setLink] = useState<string | null>(null);
  const [validade, setValidade] = useState<string | null>(null);
  /** Número normalizado pelo servidor (com DDI) — é o que vai para o wa.me. */
  const [numeroEnvio, setNumeroEnvio] = useState<string | null>(null);

  /**
   * Promoção de folguista: o que já está cadastrado dela entra preenchido, e o
   * gestor só confirma vínculo, trabalho após 22h e prazo.
   */
  useEffect(() => {
    if (!open || !inicial) return;
    setNome((v) => v || (inicial.nome ?? "").toLocaleUpperCase("pt-BR"));
    setWhatsapp((v) => v || (inicial.whatsapp ?? ""));
    setCpf((v) => v || maskCpf(String(inicial.cpf ?? "").replace(/\D/g, "")));
    if (inicial.unidadeId) setUnidadeId((v) => v || inicial.unidadeId!);
    if (inicial.cargoId) setCargoId((v) => v || inicial.cargoId!);
  }, [open, inicial]);

  /** Ao abrir, oferece o rascunho guardado — nada é preenchido sem a escolha. */
  useEffect(() => {
    if (!open) return;
    let ativo = true;
    void (async () => {
      const guardado = await rascunho.carregar();
      if (!ativo || !guardado) return;
      setRascunhoGuardado({ campos: camposDoRascunhoConvite(guardado.dados), em: guardado.atualizadoEm });
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chaveRascunho]);

  /** Gravação automática após a pausa na digitação. */
  useEffect(() => {
    if (!open || link) return;
    rascunho.agendar(
      conteudoRascunhoConvite({ nome, cpf, whatsapp, unidade_id: unidadeId, cargo_id: cargoId, regime, apos22h, dias }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, link, nome, cpf, whatsapp, unidadeId, cargoId, regime, apos22h, dias]);

  const retomarRascunho = () => {
    const c = rascunhoGuardado?.campos;
    if (!c) return;
    if (c.nome) setNome(c.nome);
    if (c.cpf) setCpf(c.cpf);
    if (c.whatsapp) setWhatsapp(c.whatsapp);
    if (c.unidade_id) setUnidadeId(c.unidade_id);
    if (c.cargo_id) setCargoId(c.cargo_id);
    if (c.regime) setRegime(c.regime);
    if (c.apos22h === "sim" || c.apos22h === "nao") setApos22h(c.apos22h);
    if (c.dias) setDias(c.dias);
    setRascunhoGuardado(null);
  };

  const comecarDoZero = () => {
    setRascunhoGuardado(null);
    void rascunho.descartar();
  };


  const unidadesDaEmpresa = unidades.filter((u) => u.company_id === selectedCompanyId);
  const cargosDaEmpresa = cargos; // o hook já traz apenas os cargos da empresa selecionada
  // Cargos da unidade escolhida. A lista nunca fica vazia em silêncio: falha,
  // carregamento e ausência de vínculo têm aviso próprio (ver cargos-unidade.ts).
  const {
    data: cargosVinculados = [],
    isLoading: carregandoVinculos,
    isError: erroVinculos,
    refetch: recarregarVinculos,
  } = useDpCargosDaUnidade(unidadeId || null);
  const listaCargos = listaCargosDaUnidade({
    cargosEmpresa: cargosDaEmpresa,
    vinculados: cargosVinculados,
    unidadeId: unidadeId || null,
    carregandoVinculos,
    carregandoCargos,
    erro: erroCargos || erroVinculos,
  });
  const cargosDaUnidade = listaCargos.cargos;

  /** Registra a falha de leitura para conseguirmos rastrear a causa depois. */
  useEffect(() => {
    if (!erroCargos && !erroVinculos) return;
    void reportError({
      error: new Error("Cargos do convite de pré-admissão não carregaram"),
      surface: "Pessoas 360°",
      action: "carregar os cargos da unidade",
      details: { unidadeId, companyId: selectedCompanyId, erroCargos, erroVinculos },
    });
  }, [erroCargos, erroVinculos, unidadeId, selectedCompanyId]);
  const cpfDigitos = cpf.replace(/\D/g, "");
  const cpfOk = isValidCpf(cpfDigitos);

  /** Trocar a unidade limpa o cargo: nunca fica uma combinação inválida. */
  const escolherUnidade = (v: string) => {
    setUnidadeId(v);
    setCargoId("");
  };

  const fechar = () => {
    onOpenChange(false);
    setNome(""); setWhatsapp(""); setCargoId(""); setUnidadeId(""); setCpf("");
    setRegime(""); setApos22h(""); setDias("7"); setLink(null); setValidade(null); setNumeroEnvio(null);
  };

  const completo =
    nome.trim().length >= 3 && whatsapp.replace(/\D/g, "").length >= 10 && cpfOk
    && !!cargoId && !!unidadeId && !!regime && !!apos22h;

  const enviar = async () => {
    try {
      const r = await criar.mutateAsync({
        candidato_nome: nome.trim(),
        whatsapp: whatsapp.trim(),
        cpf: cpfDigitos,
        cargo_previsto_id: cargoId,
        unidade_prevista_id: unidadeId,
        regime_previsto: regime,
        trabalho_apos_22h: apos22h === "sim",
        dias_validade: Number(dias) || 7,
      });
      // Promoção de folguista: a admissão fica amarrada à pessoa no servidor,
      // para que ela não seja promovida duas vezes por caminhos diferentes.
      if (inicial?.pessoaApoioId) {
        try {
          await vincularOrigemApoio(inicial.pessoaApoioId, { preadmissaoId: r.preadmissao_id });
        } catch (e) {
          toast.error(mensagemOrigemApoio(e));
        }
      }
      setLink(r.link);
      setValidade(r.expires_at);
      setNumeroEnvio(r.whatsapp ?? null);
      // Convite criado: o rascunho já cumpriu o papel.
      setRascunhoGuardado(null);
      void rascunho.descartar();
      toast.success("Convite criado. Copie o link e envie ao candidato.");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "criar o convite" });
    }
  };

  const copiar = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convidar Candidato Para Preencher</DialogTitle>
          <DialogDescription>
            O candidato preenche os dados e envia os documentos pelo celular. Nada entra no cadastro antes da sua
            revisão e da ficha oficial da contabilidade.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="pa-link">Link do candidato</Label>
              <div className="flex gap-2">
                <Input id="pa-link" readOnly value={link} className="h-10 text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" className="h-10" onClick={copiar} aria-label="Copiar o link">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Vale até {validade ? new Date(validade).toLocaleDateString("pt-BR") : "a data informada"}. Este link
              aparece só agora: se precisar, gere outro na lista de pré-admissões.
            </p>
            {numeroEnvio ? (
              <Button className="w-full h-11" asChild>
                <a
                  href={`https://wa.me/${numeroEnvio}?text=${encodeURIComponent(
                    `Olá! Para começar sua admissão, preencha seus dados neste link: ${link}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4 mr-2" /> Enviar Pelo WhatsApp
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Não foi possível montar o envio pelo WhatsApp. Copie o link e envie manualmente.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="pa-nome">Nome do candidato</Label>
              <Input
                id="pa-nome"
                value={nome}
                autoCapitalize="characters"
                onChange={(e) => setNome(e.target.value.toLocaleUpperCase("pt-BR"))}
                className="h-10"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="pa-cpf">CPF do candidato</Label>
                <Input
                  id="pa-cpf"
                  value={cpf}
                  inputMode="numeric"
                  className="h-10"
                  placeholder="000.000.000-00"
                  onChange={(e) => setCpf(maskCpf(e.target.value))}
                />
                {cpf && !cpfOk && <p className="text-xs text-destructive">Confira o CPF: os números não fecham.</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="pa-whats">WhatsApp com DDD</Label>
                <Input
                  id="pa-whats"
                  value={whatsapp}
                  inputMode="tel"
                  autoComplete="tel"
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="h-10"
                  placeholder="(62) 99999-9999"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="pa-dias">Link vale por (dias)</Label>
                <Input
                  id="pa-dias"
                  value={dias}
                  inputMode="numeric"
                  onChange={(e) => setDias(e.target.value.replace(/\D/g, ""))}
                  className="h-10"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Unidade prevista</Label>
                <Select value={unidadeId} onValueChange={escolherUnidade}>
                  <SelectTrigger className="h-10" aria-label="Unidade prevista"><SelectValue placeholder="Escolher" /></SelectTrigger>
                  <SelectContent>
                    {unidadesDaEmpresa.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cargo previsto</Label>
                <Select value={cargoId} onValueChange={setCargoId} disabled={!unidadeId}>
                  <SelectTrigger className="h-10" aria-label="Cargo previsto">
                    <SelectValue placeholder={unidadeId ? "Escolher" : "Escolha a unidade primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cargosDaUnidade.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {listaCargos.aviso && (
                  <p className="text-xs text-muted-foreground">{listaCargos.aviso}</p>
                )}
                {(erroCargos || erroVinculos) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => { void recarregarCargos(); void recarregarVinculos(); }}
                  >
                    Tentar De Novo
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de vínculo previsto</Label>
              <Select value={regime} onValueChange={setRegime}>
                <SelectTrigger className="h-10" aria-label="Tipo de vínculo previsto">
                  <SelectValue placeholder="Escolher" />
                </SelectTrigger>
                <SelectContent>
                  {REGIMES_ADMISSAO.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Define quais dados e documentos a ficha vai pedir ao candidato.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vai trabalhar depois das 22h?</Label>
              <Select value={apos22h} onValueChange={(v) => setApos22h(v as "sim" | "nao")}>
                <SelectTrigger className="h-10" aria-label="Trabalho depois das 22h">
                  <SelectValue placeholder="Escolher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Menor de 18 anos não pode trabalhar após as 22h — o sistema bloqueia a admissão.
              </p>
            </div>
            {!completo && (
              <p className="text-xs text-muted-foreground">
                Informe nome, CPF, WhatsApp, unidade, cargo, tipo de vínculo e a decisão sobre o trabalho após as 22h.
              </p>
            )}
            {rotuloSalvoEm(rascunho.salvoEm) && (
              <p className="text-xs text-muted-foreground">
                {`Rascunho ${rotuloSalvoEm(rascunho.salvoEm).toLowerCase()} — você pode fechar e continuar depois.`}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {link ? (
            <Button variant="outline" onClick={fechar}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
              <Button onClick={enviar} disabled={criar.isPending || !completo}>
                Criar Convite
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

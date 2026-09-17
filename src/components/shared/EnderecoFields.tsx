/**
 * Bloco de endereço usado em todo o sistema (candidato, colaborador, portal,
 * empresas e unidades).
 *
 * Regras que valem em qualquer tela:
 * - o CEP é a primeira informação e, ao completar, preenche rua, bairro,
 *   cidade e UF automaticamente;
 * - falha na consulta não trava nada: dá para digitar tudo à mão;
 * - a UF é sempre escolhida numa lista com os 27 estados;
 * - "Sem número" dispensa o campo número e grava S/N.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SEM_NUMERO, UFS, cepCompleto, consultarCep, maskCep } from "@/lib/endereco";

export interface EnderecoValor {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

interface Props {
  valor: EnderecoValor;
  onChange: (patch: EnderecoValor) => void;
  /** Sufixo dos ids, para conviver com mais de um endereço na mesma tela. */
  idPrefix?: string;
  /** Mostra tudo em CAIXA ALTA (cadastros). */
  upper?: boolean;
  erros?: Record<string, string>;
  disabled?: boolean;
}

export function EnderecoFields({
  valor, onChange, idPrefix = "end", upper = false, erros = {}, disabled,
}: Props) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const ultimoCep = useRef<string>("");
  const semNumero = String(valor.numero ?? "").trim().toUpperCase() === SEM_NUMERO;

  const caixa = (v: string) => (upper ? v.toLocaleUpperCase("pt-BR") : v);
  const id = (n: string) => `${idPrefix}-${n}`;

  useEffect(() => {
    const cep = String(valor.cep ?? "");
    if (!cepCompleto(cep)) { setAviso(null); return; }
    if (ultimoCep.current === cep.replace(/\D/g, "")) return;
    ultimoCep.current = cep.replace(/\D/g, "");
    let vivo = true;
    setBuscando(true);
    consultarCep(cep)
      .then((achado) => {
        if (!vivo) return;
        if (!achado) {
          setAviso("Não encontramos este CEP. Preencha o endereço à mão.");
          return;
        }
        setAviso(null);
        onChange({
          logradouro: caixa(achado.logradouro),
          bairro: caixa(achado.bairro),
          cidade: caixa(achado.cidade),
          uf: achado.uf,
        });
      })
      .finally(() => vivo && setBuscando(false));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.cep]);

  const erro = (campo: string) =>
    erros[campo] ? <p className="text-xs text-destructive">{erros[campo]}</p> : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={id("cep")}>CEP</Label>
        <div className="relative">
          <Input
            id={id("cep")}
            className="h-11"
            inputMode="numeric"
            autoComplete="postal-code"
            disabled={disabled}
            value={maskCep(String(valor.cep ?? ""))}
            onChange={(e) => onChange({ cep: maskCep(e.target.value) })}
          />
          {buscando && (
            <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3.5 text-muted-foreground" />
          )}
        </div>
        {aviso ? <p className="text-xs text-muted-foreground">{aviso}</p> : erro("cep")}
      </div>

      <div className="space-y-1">
        <Label className="text-xs" htmlFor={id("logradouro")}>Rua / Avenida</Label>
        <Input
          id={id("logradouro")}
          className="h-11"
          autoComplete="address-line1"
          disabled={disabled}
          value={String(valor.logradouro ?? "")}
          onChange={(e) => onChange({ logradouro: caixa(e.target.value) })}
        />
        {erro("logradouro")}
      </div>

      <div className="space-y-1">
        <Label className="text-xs" htmlFor={id("numero")}>Número</Label>
        <Input
          id={id("numero")}
          className="h-11"
          inputMode="numeric"
          disabled={disabled || semNumero}
          value={semNumero ? "" : String(valor.numero ?? "")}
          onChange={(e) => onChange({ numero: e.target.value })}
        />
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id={id("sem-numero")}
            checked={semNumero}
            disabled={disabled}
            onCheckedChange={(v) => onChange({ numero: v ? SEM_NUMERO : "" })}
          />
          <Label className="text-xs font-normal" htmlFor={id("sem-numero")}>Sem número</Label>
        </div>
        {erro("numero")}
      </div>

      <div className="space-y-1">
        <Label className="text-xs" htmlFor={id("complemento")}>Complemento</Label>
        <Input
          id={id("complemento")}
          className="h-11"
          disabled={disabled}
          value={String(valor.complemento ?? "")}
          onChange={(e) => onChange({ complemento: caixa(e.target.value) })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs" htmlFor={id("bairro")}>Bairro</Label>
        <Input
          id={id("bairro")}
          className="h-11"
          disabled={disabled}
          value={String(valor.bairro ?? "")}
          onChange={(e) => onChange({ bairro: caixa(e.target.value) })}
        />
        {erro("bairro")}
      </div>

      <div className="space-y-1">
        <Label className="text-xs" htmlFor={id("cidade")}>Cidade</Label>
        <Input
          id={id("cidade")}
          className="h-11"
          disabled={disabled}
          value={String(valor.cidade ?? "")}
          onChange={(e) => onChange({ cidade: caixa(e.target.value) })}
        />
        {erro("cidade")}
      </div>

      <div className="space-y-1">
        <Label className="text-xs" htmlFor={id("uf")}>Estado (UF)</Label>
        <Select
          value={String(valor.uf ?? "")}
          disabled={disabled}
          onValueChange={(v) => onChange({ uf: v })}
        >
          <SelectTrigger id={id("uf")} className="h-11">
            <SelectValue placeholder="Escolher" />
          </SelectTrigger>
          <SelectContent>
            {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
        {erro("uf")}
      </div>
    </div>
  );
}

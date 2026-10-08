import { AccountAccessPicker } from "@/components/users/AccountAccessPicker";
import { UnitAccessPicker } from "@/components/users/UnitAccessPicker";
import { useCompanyAccounts } from "@/hooks/useCompanyAccounts";
import { useCompanyUnidades } from "@/hooks/useCompanyUnidades";

/** Escolha por empresa: null = tudo; lista = somente os itens marcados. */
export type EscopoPorEmpresa = Record<string, string[] | null>;

interface Props {
  empresas: { id: string; name: string }[];
  contas: EscopoPorEmpresa;
  unidades: EscopoPorEmpresa;
  onContasChange: (companyId: string, v: string[] | null) => void;
  onUnidadesChange: (companyId: string, v: string[] | null) => void;
  bloqueado?: boolean;
}

function BlocoEmpresa({
  empresa, contas, unidades, onContasChange, onUnidadesChange, bloqueado, mostrarNome,
}: {
  empresa: { id: string; name: string };
  contas: string[] | null;
  unidades: string[] | null;
  onContasChange: (v: string[] | null) => void;
  onUnidadesChange: (v: string[] | null) => void;
  bloqueado?: boolean;
  mostrarNome: boolean;
}) {
  const { data: listaContas = [] } = useCompanyAccounts(empresa.id);
  const { data: listaUnidades = [] } = useCompanyUnidades(empresa.id);
  const nome = mostrarNome ? empresa.name : undefined;
  return (
    <div className="space-y-2">
      <AccountAccessPicker accounts={listaContas} value={contas} onChange={onContasChange} bloqueado={bloqueado} nomeEmpresa={nome} />
      <UnitAccessPicker unidades={listaUnidades} value={unidades} onChange={onUnidadesChange} bloqueado={bloqueado} nomeEmpresa={nome} />
    </div>
  );
}

/** Um bloco de contas financeiras e unidades para cada empresa marcada. */
export function CompanyScopedAccessPickers({ empresas, contas, unidades, onContasChange, onUnidadesChange, bloqueado }: Props) {
  return (
    <div className="space-y-4">
      {empresas.map((e) => (
        <BlocoEmpresa
          key={e.id}
          empresa={e}
          contas={contas[e.id] ?? null}
          unidades={unidades[e.id] ?? null}
          onContasChange={(v) => onContasChange(e.id, v)}
          onUnidadesChange={(v) => onUnidadesChange(e.id, v)}
          bloqueado={bloqueado}
          mostrarNome
        />
      ))}
    </div>
  );
}

/** Confere se alguma empresa ficou com lista vazia (nada marcado). */
export function empresaComListaVazia(ids: string[], escopo: EscopoPorEmpresa) {
  return ids.find((id) => Array.isArray(escopo[id]) && escopo[id]!.length === 0);
}

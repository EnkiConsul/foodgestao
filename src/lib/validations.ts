import { z } from "zod";

// ---- Company ----
export const companySchema = z.object({
  name: z.string().trim().min(1, "Razão social é obrigatória").max(200),
  trade_name: z.string().trim().max(200).optional().nullable(),
  cnpj: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email("E-mail inválido").max(100).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable(),
  whatsapp: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
});

// ---- Contact ----
export const contactSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(100),
  contact_type: z.enum(["cliente", "fornecedor", "ambos"]),
  email: z.string().trim().email("E-mail inválido").max(100).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable(),
  document: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

// ---- Account ----
export const accountSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(100),
  account_type: z.enum(["corrente", "poupanca", "investimento", "cartao_credito", "dinheiro", "outro"]),
  initial_balance: z.number().finite().optional(),
});

// ---- Transaction ----
export const transactionSchema = z.object({
  description: z.string().trim().min(1, "Descrição é obrigatória").max(200),
  amount: z.number().finite().refine((v) => v !== 0, "Valor não pode ser zero"),
  transaction_type: z.enum(["entrada", "saida", "transferencia"]),
  transaction_date: z.string().min(1, "Data é obrigatória"),
  account_id: z.string().uuid("Selecione uma conta"),
  destination_account_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(500).optional().nullable(),
  payment_method_id: z.string().uuid().optional().nullable().or(z.literal("")),
  due_date: z.string().optional().nullable(),
  is_installment: z.boolean().optional(),
  installment_total: z.number().int().min(2).max(360).optional().nullable(),
});


// ---- Category ----
export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(50),
  transaction_type: z.enum(["entrada", "saida"]),
  color: z.string().max(20).optional().nullable(),
  category_subtype: z.enum(
    ["receita", "saida", "custo", "despesa", "imposto", "investimento"],
    { required_error: "Subtipo é obrigatório", invalid_type_error: "Subtipo é obrigatório" }
  ),
});

// ---- Budget ----
export const budgetSchema = z.object({
  category_id: z.string().uuid("Selecione uma categoria"),
  amount: z.number().positive("Valor deve ser positivo").finite(),
  period: z.enum(["mensal", "anual"]),
  start_date: z.string().min(1, "Data início é obrigatória"),
  end_date: z.string().min(1, "Data fim é obrigatória"),
});

// ---- Payment Method ----
export const paymentMethodSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(60),
  is_active: z.boolean(),
});

// ---- Cost Center ----
export const costCenterSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(80),
  description: z.string().trim().max(200).optional().default(""),
  is_active: z.boolean(),
});



// ---- Chart Account ----
export const chartAccountSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(120),
  short_code: z.string().trim().max(30).optional().nullable(),
  is_tax: z.boolean(),
  tax_code: z.string().trim().max(20).optional().nullable(),
  tax_description: z.string().trim().max(100).optional().nullable(),
}).refine((d) => !d.is_tax || (!!d.tax_code && !!d.tax_description), {
  message: "Informe código e descrição do imposto",
  path: ["tax_code"],
});

/** Helper: validate and return parsed data or null (shows toast on error) */
export function validateWithToast<T>(schema: z.ZodSchema<T>, data: unknown, toastFn: (msg: string) => void): T | null {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  toastFn(result.error.errors[0]?.message ?? "Dados inválidos");
  return null;
}

// ---- Pessoa avulsa na rotina do dia (teste/folguista) ----
export const pessoaAvulsaSchema = z
  .object({
    nome: z.string().trim().max(120).nullable().optional(),
    tipo: z.enum(["teste", "folguista", "registro_manual"]),
    colaborador_id: z.string().uuid().nullable().optional(),
    unidade_id: z.string().uuid("Selecione a unidade"),
    cargo_id: z.string().uuid("Selecione o cargo"),
    cobre_colaborador_id: z.string().uuid().nullable().optional(),
    data_inicio: z.string().min(10, "Informe a data inicial"),
    data_fim: z.string().min(10, "Informe a data final"),
    entrada: z.string().nullable().optional(),
    saida: z.string().nullable().optional(),
    termina_no_dia_seguinte: z.boolean().optional(),
    observacao: z.string().trim().max(500, "Observação muito longa (máx. 500)").nullable().optional(),
    telefone: z.string().trim().max(20, "Telefone inválido").nullable().optional(),
    pessoa_apoio_id: z.string().uuid().nullable().optional(),

  })
  .refine((d) => d.data_fim >= d.data_inicio, {
    message: "A data final não pode ser anterior à data inicial",
    path: ["data_fim"],
  })
  .refine((d) => (d.tipo === "registro_manual" ? !!d.colaborador_id : true), {
    message: "Selecione o colaborador que trabalhou",
    path: ["colaborador_id"],
  })
  .refine((d) => (d.tipo === "registro_manual" ? true : !!d.nome && d.nome.trim().length >= 2), {
    message: "Informe o nome da pessoa",
    path: ["nome"],
  });

/** Cadastro reaproveitável de folguistas e pessoas em teste. */
export const pessoaApoioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120, "Nome muito longo"),
  telefone: z.string().trim().max(20, "Telefone inválido").nullable().optional(),
  tipo: z.enum(["teste", "folguista"]),
  cargo_id: z.string().uuid().nullable().optional(),
  unidade_id: z.string().uuid().nullable().optional(),
  cpf: z.string().trim().max(14).nullable().optional(),
  genero: z.string().trim().max(20).nullable().optional(),
  data_nascimento: z.string().nullable().optional(),
  observacao: z.string().trim().max(500, "Observação muito longa (máx. 500)").nullable().optional(),
  colaborador_id: z.string().uuid().nullable().optional(),
});


/** Sugere o nome do segmento a partir do CNAE principal e do nome da empresa. Retorna null quando não há certeza. */
export function segmentoPorCnae(cnae: string | number | null | undefined, nomeEmpresa = ""): string | null {
  const nome = nomeEmpresa.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const porNome: [RegExp, string][] = [
    [/pizz/, "Pizzaria"],
    [/burger|hamburg/, "Hamburgueria"],
    [/sushi|temaki|japones/, "Sushi / Comida Japonesa"],
    [/churrasc/, "Churrascaria"],
    [/pastel/, "Pastelaria"],
    [/marmit/, "Marmitaria"],
    [/acai|sorvet/, "Sorveteria / Açaiteria"],
    [/cafe|cafeteria/, "Cafeteria"],
  ];
  const codigo = String(cnae ?? "").replace(/\D/g, "");
  if (!codigo) return null;
  const food = codigo.startsWith("56");
  if (food) for (const [re, seg] of porNome) if (re.test(nome)) return seg;
  const mapa: Record<string, string> = {
    "5611201": "Restaurante",
    "5611203": "Lanchonete",
    "5611204": "Bar",
    "5611205": "Bar",
    "5612100": "Food Truck",
    "5620101": "Cozinha Industrial / Refeições Coletivas",
    "5620102": "Buffet / Casa de Eventos",
    "5620103": "Cozinha Industrial / Refeições Coletivas",
    "5620104": "Delivery / Dark Kitchen",
    "1091102": "Padaria",
    "4721102": "Padaria",
    "1053800": "Sorveteria / Açaiteria",
    "4723700": "Adega / Distribuidora de Bebidas",
    "4712100": "Conveniência",
    "4729699": "Empório / Mercearia",
    "5510801": "Hotel / Pousada com Restaurante",
    "5590601": "Hotel / Pousada com Restaurante",
  };
  return mapa[codigo] ?? null;
}

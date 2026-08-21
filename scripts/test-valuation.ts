/**
 * Tests del motor de tasación de usados.
 *
 * Sin framework, como el resto: `pnpm test:valuation`.
 *
 * Lo que se prueba no es la aritmética por la aritmética: son los casos donde un
 * error se paga con plata real. Un auto muy rodado que da valor negativo, un
 * usado que termina valiendo más que el 0km, un ajuste que se aplica al número
 * equivocado.
 */
import {
  DEFAULT_SETTINGS,
  expectedKm,
  valuate,
  type ValuationSettings,
} from "@/lib/used-prices/valuate";

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`✓ ${name}`);
  else {
    failed++;
    console.log(`✗ ${name}${detail ? `\n    ${detail}` : ""}`);
  }
}
function near(a: number, b: number, tol = 1) {
  return Math.abs(a - b) <= tol;
}

const YEAR = 2026;
// Cronos 1.3 Drive MT Pack Plus 2024, valor real de la guía de agosto 2026.
const CRONOS_2024 = 25_358_700;

console.log("\n— Kilómetros esperados —");
check("un 2024 en 2026 espera ~30.000 km", expectedKm(2024, YEAR, 15000) === 30000);
check(
  "un auto del año no espera 0 km (se cuenta medio año)",
  expectedKm(2026, YEAR, 15000) === 7500,
);

console.log("\n— El caso normal —");
const normal = valuate(
  { guideValue: CRONOS_2024, year: 2024, km: 30000, condition: "bueno", currentYear: YEAR },
  DEFAULT_SETTINGS,
);
check(
  "con km justos y estado bueno, el mercado es el valor de guía",
  near(normal.marketValue, CRONOS_2024, 100),
  `mercado=${normal.marketValue} guía=${CRONOS_2024}`,
);
check(
  "la oferta es 14% menos que el mercado (6 recond. + 8 margen)",
  near(normal.offerSuggested, CRONOS_2024 * 0.86, 200),
  `oferta=${normal.offerSuggested} esperado≈${Math.round(CRONOS_2024 * 0.86)}`,
);
check(
  "la oferta SIEMPRE es menor que el mercado",
  normal.offerSuggested < normal.marketValue,
);
check(
  "el rango contiene a la sugerida",
  normal.offerMin < normal.offerSuggested && normal.offerSuggested < normal.offerMax,
);

console.log("\n— Kilómetros —");
const rodado = valuate(
  { guideValue: CRONOS_2024, year: 2024, km: 90000, condition: "bueno", currentYear: YEAR },
  DEFAULT_SETTINGS,
);
check(
  "60.000 km de más castigan 9% (6 × 1,5)",
  near(rodado.marketValue, CRONOS_2024 * 0.91, 300),
  `mercado=${rodado.marketValue}`,
);
const poco = valuate(
  { guideValue: CRONOS_2024, year: 2024, km: 10000, condition: "bueno", currentYear: YEAR },
  DEFAULT_SETTINGS,
);
check("menos km que lo esperado sube el valor", poco.marketValue > CRONOS_2024);
check(
  "el premio por pocos km es menor que el castigo por muchos",
  poco.marketValue - CRONOS_2024 < CRONOS_2024 - rodado.marketValue,
);

console.log("\n— Los casos que cuestan plata —");
const destruido = valuate(
  { guideValue: CRONOS_2024, year: 2024, km: 900000, condition: "malo", currentYear: YEAR },
  DEFAULT_SETTINGS,
);
check("900.000 km NO da un valor negativo", destruido.offerMin >= 0, `${destruido.offerMin}`);
check(
  "y avisa que el ajuste se topó",
  destruido.warnings.some((w) => w.includes("topó")),
  JSON.stringify(destruido.warnings),
);
check(
  "y avisa que conviene tasarlo a mano",
  destruido.warnings.some((w) => w.includes("300.000")),
);

const conTecho = valuate(
  {
    guideValue: 30_000_000,
    year: 2026,
    km: 0,
    condition: "excelente",
    currentYear: YEAR,
    newPrice: 31_000_000,
  },
  DEFAULT_SETTINGS,
);
check(
  "un usado no puede valer más que el 0km",
  conTecho.marketValue <= 31_000_000,
  `mercado=${conTecho.marketValue}`,
);
check(
  "y cuando se topa, lo dice",
  conTecho.warnings.some((w) => w.includes("0km")),
  JSON.stringify(conTecho.warnings),
);

console.log("\n— Estado —");
for (const [cond, esperado] of [
  ["excelente", 1.03],
  ["bueno", 1.0],
  ["regular", 0.95],
  ["malo", 0.88],
] as const) {
  const v = valuate(
    { guideValue: 20_000_000, year: 2024, km: 30000, condition: cond, currentYear: YEAR },
    DEFAULT_SETTINGS,
  );
  check(
    `estado ${cond} → ${Math.round((esperado - 1) * 100)}%`,
    near(v.marketValue, 20_000_000 * esperado, 200),
    `mercado=${v.marketValue}`,
  );
}

console.log("\n— Configuración por concesionaria —");
const agresiva: ValuationSettings = {
  ...DEFAULT_SETTINGS,
  reconPercent: 2,
  marginPercent: 3,
};
const conservadora: ValuationSettings = {
  ...DEFAULT_SETTINGS,
  reconPercent: 12,
  marginPercent: 15,
};
const base = { guideValue: 20_000_000, year: 2024, km: 30000, condition: "bueno" as const, currentYear: YEAR };
const a = valuate(base, agresiva);
const c = valuate(base, conservadora);
check("una concesionaria agresiva ofrece más que una conservadora", a.offerSuggested > c.offerSuggested);
check(
  "pero las dos ven el MISMO valor de mercado (los % sólo afectan la oferta)",
  a.marketValue === c.marketValue,
  `${a.marketValue} vs ${c.marketValue}`,
);
check(
  "un spread de 0 deja el rango en un punto",
  (() => {
    const v = valuate(base, { ...DEFAULT_SETTINGS, spreadPercent: 0 });
    return v.offerMin === v.offerMax;
  })(),
);

console.log("\n— Redondeo —");
check(
  "los valores salen redondeados a la centena",
  [normal.marketValue, normal.offerMin, normal.offerMax, normal.offerSuggested].every(
    (n) => n % 100 === 0,
  ),
);

console.log(
  failed === 0 ? "\nTodos los casos OK\n" : `\n${failed} caso(s) FALLARON\n`,
);
process.exit(failed === 0 ? 0 : 1);

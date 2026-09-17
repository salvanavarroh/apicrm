// ============================================================================
// Provincia argentina a partir del código de área del teléfono.
//
// Existe porque el dato declarado recién empieza a juntarse: hasta hoy sólo el
// 0,8% de los leads tenía ciudad, y era texto libre. El teléfono, en cambio, lo
// tiene el 37% y en Argentina el código de área identifica la provincia.
//
// Es una INFERENCIA y se trata como tal: se calcula al vuelo para el reporte y
// no se guarda en el lead. Un número puede no vivir donde lo dieron de alta —
// alguien de Córdoba que se mudó a Buenos Aires conserva su 351— así que
// guardarla la haría pasar por un dato declarado. Cuando el lead tiene
// `province` cargada, esa manda y esto no se usa.
//
// La tabla cubre los códigos de 2 y 3 dígitos (que son la enorme mayoría del
// tráfico) y los de 4 dígitos más frecuentes del interior. Lo que no matchea
// cae en "Sin identificar", que el reporte muestra explícitamente en vez de
// repartirlo o esconderlo.
// ============================================================================

export const UNKNOWN_PROVINCE = "Sin identificar";

/** Las 24 jurisdicciones, con la grafía que muestra el reporte. */
export const PROVINCES = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba",
  "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
  "Tierra del Fuego", "Tucumán",
] as const;

/** Sin acentos, sin puntuación, en minúscula y con espacios colapsados. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Cómo la gente escribe cada provincia. El campo es texto libre y en los datos
// reales hay 530 valores distintos para 24 provincias: "Buenos Aires",
// "Buenos aires", "buenos aires", "bs as", "BSAS"… Sin esto, el reporte tendría
// una barra por cada forma de escribirlo.
const ALIASES: Record<string, string> = {};
function alias(canonical: string, ...forms: string[]) {
  ALIASES[fold(canonical)] = canonical;
  for (const f of forms) ALIASES[fold(f)] = canonical;
}

// Se suman ciudades grandes y los errores de tipeo que aparecen en los datos
// reales: el campo es libre y mucha gente pone la ciudad, no la provincia.
alias("Buenos Aires", "bs as", "bsas", "bs. as.", "pcia de buenos aires",
  "provincia de buenos aires", "gba", "conurbano", "prov buenos aires", "ba",
  "bueno aires", "buenos aies", "mar del plata", "la plata", "bahia blanca",
  "tandil", "quilmes", "lanus", "moron", "pilar", "tigre", "san isidro");
alias("CABA", "capital federal", "ciudad de buenos aires", "capital",
  "ciudad autonoma de buenos aires", "c a b a", "capfed");
alias("Catamarca");
alias("Chaco");
alias("Chubut");
alias("Córdoba", "cba", "villa maria", "rio cuarto", "villa carlos paz");
alias("Corrientes", "ctes");
alias("Entre Ríos", "entrerrios");
alias("Formosa");
alias("Jujuy", "jujuy ss de jujuy");
alias("La Pampa");
alias("La Rioja");
alias("Mendoza", "mza", "san rafael");
alias("Misiones");
alias("Neuquén", "nqn");
alias("Río Negro");
alias("Salta");
alias("San Juan");
alias("San Luis");
alias("Santa Cruz");
alias("Santa Fe", "sta fe", "santafe", "rosario", "rafaela", "venado tuerto");
alias("Santiago del Estero", "santiago", "sgo del estero", "sgo estero");
alias("Tierra del Fuego", "ushuaia", "tdf");
alias("Tucumán", "tuc", "san miguel de tucuman");

/**
 * Texto libre → una de las 24 provincias, o null si no se reconoce.
 *
 * Primero busca el valor completo; si no, prueba si el texto CONTIENE el nombre
 * de una provincia ("Villa Maria Cordoba" → Córdoba). Lo que no matchea
 * devuelve null en vez de inventar: el reporte lo cuenta aparte.
 */
export function normalizeProvince(raw: string | null | undefined): string | null {
  const key = fold(raw ?? "");
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  // Coincidencia por contención, de la forma más larga a la más corta para que
  // "santiago del estero" no se resuelva antes como "santiago".
  const forms = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const f of forms) {
    if (f.length >= 4 && key.includes(f)) return ALIASES[f];
  }
  return null;
}

/** Código de área → provincia. Se prueba de 4 dígitos a 2. */
const AREA_TO_PROVINCE: Record<string, string> = {
  // --- 2 dígitos ---
  "11": "Buenos Aires",  // AMBA: CABA y conurbano comparten el 11

  // --- 3 dígitos ---
  "220": "Buenos Aires", "221": "Buenos Aires", "223": "Buenos Aires",
  "236": "Buenos Aires", "237": "Buenos Aires", "249": "Buenos Aires",
  "291": "Buenos Aires", "292": "Buenos Aires", "296": "Buenos Aires",
  "260": "Mendoza", "261": "Mendoza", "263": "Mendoza",
  "264": "San Juan",
  "266": "San Luis",
  "280": "Chubut", "297": "Chubut",
  "299": "Neuquén",
  "336": "Santa Fe", "341": "Santa Fe", "342": "Santa Fe",
  "343": "Entre Ríos", "345": "Entre Ríos",
  "351": "Córdoba", "353": "Córdoba", "358": "Córdoba",
  "362": "Chaco",
  "370": "Formosa",
  "376": "Misiones",
  "379": "Corrientes",
  "380": "La Rioja",
  "381": "Tucumán",
  "383": "Catamarca",
  "385": "Santiago del Estero",
  "387": "Salta",
  "388": "Jujuy",

  // --- 4 dígitos (interior) ---
  "2202": "Buenos Aires", "2223": "Buenos Aires", "2224": "Buenos Aires",
  "2225": "Buenos Aires", "2226": "Buenos Aires", "2227": "Buenos Aires",
  "2229": "Buenos Aires", "2241": "Buenos Aires", "2242": "Buenos Aires",
  "2243": "Buenos Aires", "2244": "Buenos Aires", "2245": "Buenos Aires",
  "2246": "Buenos Aires", "2252": "Buenos Aires", "2254": "Buenos Aires",
  "2255": "Buenos Aires", "2257": "Buenos Aires", "2261": "Buenos Aires",
  "2262": "Buenos Aires", "2264": "Buenos Aires", "2265": "Buenos Aires",
  "2266": "Buenos Aires", "2267": "Buenos Aires", "2268": "Buenos Aires",
  "2271": "Buenos Aires", "2272": "Buenos Aires", "2273": "Buenos Aires",
  "2274": "Buenos Aires", "2281": "Buenos Aires", "2283": "Buenos Aires",
  "2284": "Buenos Aires", "2285": "Buenos Aires", "2286": "Buenos Aires",
  "2291": "Buenos Aires", "2292": "Buenos Aires", "2296": "Buenos Aires",
  "2297": "Buenos Aires", "2320": "Buenos Aires", "2323": "Buenos Aires",
  "2324": "Buenos Aires", "2325": "Buenos Aires", "2326": "Buenos Aires",
  "2337": "Buenos Aires", "2342": "Buenos Aires", "2343": "Buenos Aires",
  "2344": "Buenos Aires", "2345": "Buenos Aires", "2346": "Buenos Aires",
  "2352": "Buenos Aires", "2353": "Buenos Aires", "2354": "Buenos Aires",
  "2355": "Buenos Aires", "2356": "Buenos Aires", "2357": "Buenos Aires",
  "2358": "Buenos Aires", "2392": "Buenos Aires", "2394": "Buenos Aires",
  "2395": "Buenos Aires", "2396": "Buenos Aires",
  "2302": "La Pampa", "2314": "Buenos Aires", "2316": "Buenos Aires",
  "2317": "Buenos Aires", "2331": "La Pampa", "2333": "La Pampa",
  "2334": "La Pampa", "2335": "La Pampa", "2338": "La Pampa",
  "2954": "La Pampa", "2952": "La Pampa", "2953": "La Pampa",
  "2901": "Tierra del Fuego", "2964": "Tierra del Fuego",
  "2920": "Río Negro", "2921": "Buenos Aires", "2931": "Buenos Aires",
  "2932": "Buenos Aires", "2933": "Buenos Aires", "2934": "Buenos Aires",
  "2935": "Buenos Aires", "2936": "Buenos Aires",
  "2940": "Río Negro", "2941": "Río Negro", "2942": "Río Negro",
  "2944": "Río Negro", "2945": "Chubut", "2946": "Chubut",
  "2948": "Neuquén", "2962": "Santa Cruz", "2963": "Santa Cruz",
  "2966": "Santa Cruz", "2972": "Neuquén", "2974": "Neuquén",
  "3327": "Buenos Aires", "3329": "Buenos Aires",
  "3382": "Buenos Aires", "3387": "Buenos Aires", "3388": "Buenos Aires",
  "3400": "Santa Fe", "3401": "Santa Fe", "3402": "Santa Fe",
  "3404": "Santa Fe", "3405": "Santa Fe", "3406": "Santa Fe",
  "3407": "Santa Fe", "3408": "Santa Fe", "3409": "Santa Fe",
  "3435": "Entre Ríos", "3436": "Entre Ríos", "3437": "Entre Ríos",
  "3438": "Entre Ríos", "3442": "Entre Ríos", "3444": "Entre Ríos",
  "3445": "Entre Ríos", "3446": "Entre Ríos", "3447": "Entre Ríos",
  "3454": "Entre Ríos", "3455": "Entre Ríos", "3456": "Entre Ríos",
  "3458": "Entre Ríos", "3460": "Santa Fe", "3462": "Santa Fe",
  "3463": "Santa Fe", "3464": "Santa Fe", "3465": "Santa Fe",
  "3466": "Santa Fe", "3467": "Santa Fe", "3468": "Santa Fe",
  "3471": "Córdoba", "3472": "Córdoba", "3476": "Santa Fe",
  "3482": "Santa Fe", "3483": "Santa Fe", "3487": "Santa Fe",
  "3489": "Buenos Aires", "3491": "Santa Fe", "3492": "Santa Fe",
  "3493": "Santa Fe", "3496": "Santa Fe", "3497": "Santa Fe",
  "3498": "Santa Fe",
  "3521": "Córdoba", "3522": "Córdoba", "3524": "Córdoba",
  "3525": "Córdoba", "3532": "Córdoba", "3533": "Córdoba",
  "3537": "Córdoba", "3541": "Córdoba", "3542": "Córdoba",
  "3543": "Córdoba", "3544": "Córdoba", "3546": "Córdoba",
  "3547": "Córdoba", "3548": "Córdoba", "3549": "Córdoba",
  "3562": "Córdoba", "3563": "Córdoba", "3564": "Córdoba",
  "3571": "Córdoba", "3572": "Córdoba", "3573": "Córdoba",
  "3574": "Córdoba", "3575": "Córdoba", "3576": "Córdoba",
  "3582": "Córdoba", "3583": "Córdoba", "3584": "Córdoba",
  "3585": "Córdoba",
  "3711": "Formosa", "3714": "Formosa", "3715": "Formosa",
  "3716": "Formosa", "3718": "Formosa",
  "3721": "Chaco", "3725": "Chaco", "3731": "Chaco", "3732": "Chaco",
  "3734": "Chaco", "3735": "Chaco", "3741": "Misiones", "3743": "Misiones",
  "3751": "Misiones", "3754": "Misiones", "3755": "Misiones",
  "3756": "Misiones", "3757": "Misiones", "3758": "Misiones",
  "3772": "Corrientes", "3773": "Corrientes", "3774": "Corrientes",
  "3775": "Corrientes", "3777": "Corrientes", "3781": "Corrientes",
  "3782": "Corrientes", "3786": "Corrientes",
  "3821": "La Rioja", "3825": "La Rioja", "3826": "La Rioja",
  "3827": "La Rioja", "3832": "Catamarca", "3833": "Catamarca",
  "3834": "Catamarca", "3835": "Catamarca", "3837": "Catamarca",
  "3838": "Catamarca", "3841": "Santiago del Estero",
  "3844": "Santiago del Estero", "3845": "Santiago del Estero",
  "3854": "Santiago del Estero", "3855": "Santiago del Estero",
  "3856": "Santiago del Estero", "3857": "Santiago del Estero",
  "3858": "Santiago del Estero",
  "3861": "Tucumán", "3862": "Santiago del Estero", "3863": "Tucumán",
  "3865": "Tucumán", "3867": "Santiago del Estero", "3868": "Tucumán",
  "3869": "Santiago del Estero",
  "3873": "Salta", "3877": "Salta", "3878": "Salta",
  "3885": "Jujuy", "3886": "Jujuy", "3887": "Jujuy", "3888": "Jujuy",
  "3891": "La Rioja", "3892": "Catamarca", "3894": "La Rioja",
};

/**
 * Provincia a partir de un teléfono en E.164. Devuelve null si no es argentino
 * o si el código no está en la tabla — el reporte lo cuenta como
 * "Sin identificar" y no lo reparte entre las demás.
 */
export function provinceFromPhone(phoneE164: string | null): string | null {
  if (!phoneE164) return null;
  const digits = phoneE164.replace(/\D/g, "");
  if (!digits.startsWith("54")) return null;

  // +54 9 <área> <abonado> en móviles; +54 <área> <abonado> en fijos. Sacamos
  // el 9 del móvil y el 15 que a veces queda pegado.
  let rest = digits.slice(2);
  if (rest.startsWith("9")) rest = rest.slice(1);
  if (rest.length !== 10) return null;

  for (const len of [4, 3, 2]) {
    const hit = AREA_TO_PROVINCE[rest.slice(0, len)];
    if (hit) return hit;
  }
  return null;
}

/**
 * La provincia de un lead: la declarada (normalizada), y si no se puede
 * reconocer, la del código de área. `declared` dice cuál de las dos ganó, para
 * que el reporte pueda mostrar qué parte del número es dato y qué parte es
 * inferencia.
 */
export function leadProvince(lead: {
  province?: string | null;
  phone_e164?: string | null;
}): { name: string; declared: boolean } {
  const declared = normalizeProvince(lead.province);
  if (declared) return { name: declared, declared: true };
  const inferred = provinceFromPhone(lead.phone_e164 ?? null);
  return { name: inferred ?? UNKNOWN_PROVINCE, declared: false };
}

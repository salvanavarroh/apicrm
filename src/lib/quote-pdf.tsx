import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { fullName } from "@/lib/leads";

export const QUOTE_MODALITY_LABEL = {
  cash: "Contado",
  financed: "Financiado",
  savings_plan: "Plan de ahorro",
} as const;

export type QuoteModality = keyof typeof QUOTE_MODALITY_LABEL;

export type QuoteData = {
  modality: QuoteModality;

  client: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    dni: string | null;
  };

  vehicle: {
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | null;
    color: string | null;
  };

  // Aritmética
  base_price: number;
  discount: number;
  used_car_value: number;
  // total = subtotal del vehículo (base − descuento − usado). Es lo que vale
  // el auto, sin contar intereses ni financiación.
  total: number;
  // total_to_pay = lo que efectivamente paga el cliente:
  //   - cash → igual a total
  //   - financed → cuota × n + anticipo (incluye intereses)
  //   - savings_plan → cuota × n + cuota inicial + alicuotas administrativas
  // total_interest = diferencia entre total_to_pay y total (intereses + admin).
  total_to_pay?: number | null;
  total_interest?: number | null;

  modality_data: Record<string, string | number | null>;

  valid_until: string | null;
  notes: string | null;
};

export type QuoteCompany = {
  name: string;
  legal_name: string | null;
  cuit: string | null;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  quote_legal_text?: string | null;
  // Cuando el logo ya incluye el nombre de la concesionaria, no repetirlo debajo.
  quote_hide_name?: boolean | null;
};

export type QuoteVendor = {
  first_name: string | null;
  last_name: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1pt solid #FF5906",
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: { flexDirection: "column", gap: 2 },
  brandName: { fontSize: 18, fontWeight: 700, color: "#FF5906" },
  brandMeta: { fontSize: 9, color: "#555" },
  badge: {
    backgroundColor: "#FF5906",
    color: "white",
    padding: "4 8",
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 4,
  },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#FF5906",
    textTransform: "uppercase",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { width: "48%", marginBottom: 4 },
  label: {
    fontSize: 8,
    color: "#777",
    textTransform: "uppercase",
    marginBottom: 1,
  },
  value: { fontSize: 11, fontWeight: 500 },
  totalsBox: {
    backgroundColor: "#fafafa",
    padding: 12,
    borderRadius: 4,
    marginTop: 12,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLabel: { fontSize: 10, color: "#555" },
  totalValue: { fontSize: 11, fontWeight: 500 },
  totalFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "1pt solid #FF5906",
    paddingTop: 6,
    marginTop: 6,
  },
  totalFinalLabel: { fontSize: 12, fontWeight: 700 },
  totalFinalValue: { fontSize: 14, fontWeight: 700, color: "#FF5906" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    paddingTop: 8,
    borderTop: "0.5pt solid #ddd",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#999",
  },
});

function fmt(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function modalityRows(modality: QuoteModality, data: QuoteData["modality_data"]) {
  if (modality === "cash") return [];
  if (modality === "financed") {
    return [
      ["Anticipo", fmt(Number(data.down_payment) || 0)],
      ["Monto a financiar", fmt(Number(data.financed_amount) || 0)],
      ["Cuotas", String(data.installments ?? "—")],
      ["TNA", data.tna ? `${data.tna}%` : "—"],
      ["CFT", data.cft ? `${data.cft}%` : "—"],
      ["Valor cuota", fmt(Number(data.installment_value) || 0)],
    ];
  }
  return [
    ["Nombre del plan", String(data.plan_name ?? "—")],
    ["Cuotas totales", String(data.total_installments ?? "—")],
    ["Cuota inicial", fmt(Number(data.initial_installment) || 0)],
    ["Valor cuota actual", fmt(Number(data.current_installment_value) || 0)],
    ["Gastos administrativos", fmt(Number(data.administrative_fees) || 0)],
  ];
}

export function QuotePdf({
  company,
  vendor,
  data,
  number,
  createdAt,
}: {
  company: QuoteCompany;
  vendor: QuoteVendor;
  data: QuoteData;
  number: string;
  createdAt: string;
}) {
  const modRows = modalityRows(data.modality, data.modality_data);
  const hasLogo =
    !!company.logo_url && !company.logo_url.toLowerCase().endsWith(".svg");
  // Si el logo ya incluye el nombre, no lo repetimos como texto debajo.
  const showName = !(company.quote_hide_name && hasLogo);

  return (
    <Document title={`Presupuesto ${number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brand}>
            {hasLogo && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image
                src={company.logo_url as string}
                style={{
                  height: 52,
                  maxWidth: 200,
                  marginBottom: 8,
                  objectFit: "contain",
                  alignSelf: "flex-start",
                }}
              />
            )}
            {showName && <Text style={styles.brandName}>{company.name}</Text>}
            {company.legal_name && (
              <Text style={styles.brandMeta}>{company.legal_name}</Text>
            )}
            {company.cuit && (
              <Text style={styles.brandMeta}>CUIT: {company.cuit}</Text>
            )}
            {company.address && (
              <Text style={styles.brandMeta}>{company.address}</Text>
            )}
            {company.phone && (
              <Text style={styles.brandMeta}>Tel: {company.phone}</Text>
            )}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text style={styles.badge}>
              {QUOTE_MODALITY_LABEL[data.modality]}
            </Text>
            <Text style={styles.brandMeta}>Presupuesto #{number}</Text>
            <Text style={styles.brandMeta}>
              {new Date(createdAt).toLocaleDateString("es-AR")}
            </Text>
            {data.valid_until && (
              <Text style={styles.brandMeta}>
                Válido hasta:{" "}
                {new Date(data.valid_until).toLocaleDateString("es-AR")}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del cliente</Text>
          <View style={styles.grid2}>
            <View style={styles.cell}>
              <Text style={styles.label}>Nombre</Text>
              <Text style={styles.value}>
                {fullName(data.client.first_name, data.client.last_name)}
              </Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>DNI</Text>
              <Text style={styles.value}>{data.client.dni ?? "—"}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>Teléfono</Text>
              <Text style={styles.value}>{data.client.phone ?? "—"}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{data.client.email ?? "—"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehículo</Text>
          <View style={styles.grid2}>
            <View style={styles.cell}>
              <Text style={styles.label}>Marca</Text>
              <Text style={styles.value}>{data.vehicle.brand ?? "—"}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>Modelo</Text>
              <Text style={styles.value}>{data.vehicle.model ?? "—"}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>Versión</Text>
              <Text style={styles.value}>{data.vehicle.version ?? "—"}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>Año</Text>
              <Text style={styles.value}>{data.vehicle.year ?? "—"}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>Color</Text>
              <Text style={styles.value}>{data.vehicle.color ?? "—"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cálculo</Text>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Precio base</Text>
              <Text style={styles.totalValue}>{fmt(data.base_price)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>− Descuento</Text>
              <Text style={styles.totalValue}>{fmt(data.discount)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>− Auto en parte de pago</Text>
              <Text style={styles.totalValue}>{fmt(data.used_car_value)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal vehículo</Text>
              <Text style={styles.totalValue}>{fmt(data.total)}</Text>
            </View>
            {data.total_interest != null && data.total_interest > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  + {data.modality === "savings_plan"
                    ? "Cuotas administrativas y alícuotas"
                    : "Intereses estimados"}
                </Text>
                <Text style={styles.totalValue}>
                  {fmt(data.total_interest)}
                </Text>
              </View>
            )}
            <View style={styles.totalFinal}>
              <Text style={styles.totalFinalLabel}>Total a pagar</Text>
              <Text style={styles.totalFinalValue}>
                {fmt(data.total_to_pay ?? data.total)}
              </Text>
            </View>
          </View>
        </View>

        {modRows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Detalle de {QUOTE_MODALITY_LABEL[data.modality]}
            </Text>
            <View style={styles.grid2}>
              {modRows.map(([label, value]) => (
                <View key={label} style={styles.cell}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.value}>{value || "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observaciones</Text>
            <Text style={{ fontSize: 10 }}>{data.notes}</Text>
          </View>
        )}

        {company.quote_legal_text && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 7, color: "#999", lineHeight: 1.4 }}>
              {company.quote_legal_text}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text>
            Atiende: {fullName(vendor.first_name, vendor.last_name)}
            {company.phone ? ` · ${company.phone}` : ""}
          </Text>
          <Text>Página 1</Text>
        </View>
      </Page>
    </Document>
  );
}

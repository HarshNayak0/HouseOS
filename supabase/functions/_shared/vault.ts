/**
 * Vault sections and their fields, shared by the app (form + display) and the `vault` Edge Function
 * (validation). Every field is encrypted; `secret` fields are also masked on screen until tapped.
 */

export type VaultSection = "wifi" | "contact" | "lease" | "insurance" | "appliance" | "account";

export interface FieldDef {
  key: string;
  label: string;
  secret?: boolean;
  type?: "text" | "tel" | "email" | "url" | "date" | "multiline";
  placeholder?: string;
}

export interface SectionDef {
  title: string;
  icon: string;
  /** what the item's label is called in the form */
  labelName: string;
  labelPlaceholder: string;
  /** lease and insurance renewal dates feed the calendar, dashboard and closet bell */
  renewal?: string;
  fields: FieldDef[];
}

const notes: FieldDef = { key: "notes", label: "Notes", type: "multiline" };

export const SECTIONS: Record<VaultSection, SectionDef> = {
  wifi: {
    title: "Wi-Fi",
    icon: "📶",
    labelName: "Name",
    labelPlaceholder: "Home Wi-Fi",
    fields: [
      { key: "network", label: "Network name", placeholder: "Veedu-5G" },
      { key: "password", label: "Password", secret: true },
      { key: "router", label: "Router admin password", secret: true },
      notes,
    ],
  },
  contact: {
    title: "Contacts",
    icon: "📇",
    labelName: "Name",
    labelPlaceholder: "Landlord, plumber, building office…",
    fields: [
      { key: "role", label: "Who they are", placeholder: "Landlord" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Address" },
      notes,
    ],
  },
  lease: {
    title: "Lease",
    icon: "🏠",
    labelName: "Name",
    labelPlaceholder: "Apartment lease",
    renewal: "Lease ends / renews",
    fields: [
      { key: "landlord", label: "Landlord / property manager" },
      { key: "address", label: "Address" },
      { key: "rent", label: "Monthly rent" },
      { key: "unit_code", label: "Unit / buzzer / lockbox code", secret: true },
      notes,
    ],
  },
  insurance: {
    title: "Insurance",
    icon: "🛡️",
    labelName: "Name",
    labelPlaceholder: "Tenant insurance",
    renewal: "Renews on",
    fields: [
      { key: "provider", label: "Provider" },
      { key: "policy", label: "Policy number", secret: true },
      { key: "phone", label: "Claims phone", type: "tel" },
      { key: "premium", label: "Premium" },
      notes,
    ],
  },
  appliance: {
    title: "Appliances",
    icon: "🔌",
    labelName: "Appliance",
    labelPlaceholder: "Washer",
    fields: [
      { key: "brand", label: "Brand" },
      { key: "model", label: "Model" },
      { key: "serial", label: "Serial number", secret: true },
      { key: "purchased", label: "Bought on", type: "date" },
      { key: "warranty", label: "Warranty until", type: "date" },
      { key: "manual_url", label: "Manual link", type: "url" },
      notes,
    ],
  },
  account: {
    title: "Shared accounts",
    icon: "🔑",
    labelName: "Service",
    labelPlaceholder: "Netflix, hydro, internet provider…",
    fields: [
      { key: "username", label: "Username / email" },
      { key: "password", label: "Password", secret: true },
      { key: "account_no", label: "Account number", secret: true },
      { key: "url", label: "Website", type: "url" },
      notes,
    ],
  },
};

export const SECTION_ORDER: VaultSection[] = ["wifi", "contact", "lease", "insurance", "appliance", "account"];

export interface VaultItemInput {
  id?: string;
  section: VaultSection;
  label: string;
  renewal_date: string | null;
  fields: Record<string, string>;
}

/** Validate and clean what the app sends. Returns the cleaned item or an error message. */
export function validateVaultItem(x: unknown): VaultItemInput | string {
  if (!x || typeof x !== "object") return "Missing item";
  const o = x as Record<string, unknown>;
  const section = o.section as VaultSection;
  const def = SECTIONS[section];
  if (!def) return "Unknown section";
  if (o.id !== undefined && (typeof o.id !== "string" || !/^[0-9a-f-]{36}$/i.test(o.id))) return "Bad id";
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!label) return `Give it a ${def.labelName.toLowerCase()}`;
  if (label.length > 80) return "That name is too long";
  let renewal: string | null = null;
  if (def.renewal && typeof o.renewal_date === "string" && o.renewal_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.renewal_date) || isNaN(Date.parse(o.renewal_date))) return "Use a real date";
    renewal = o.renewal_date;
  }
  const raw = (o.fields && typeof o.fields === "object" ? o.fields : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const f of def.fields) {
    const v = raw[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string") return `${f.label} must be text`;
    const max = f.type === "multiline" ? 2000 : 500;
    if (v.length > max) return `${f.label} is too long`;
    if (f.type === "url" && !/^https?:\/\//i.test(v.trim())) return `${f.label} must start with https://`;
    if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${f.label} must be a date`;
    fields[f.key] = f.type === "multiline" ? v : v.trim();
  }
  return { id: o.id as string | undefined, section, label, renewal_date: renewal, fields };
}

/** PINs are exactly 6 digits and not trivially guessable. */
export function pinProblem(pin: unknown): string | null {
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) return "The PIN must be 6 digits";
  if (/^(\d)\1{5}$/.test(pin)) return "Pick a PIN that isn't the same digit six times";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "Pick a PIN that isn't a straight run";
  return null;
}

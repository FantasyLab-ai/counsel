// persona.ts — who the owner IS shapes what Counsel leads with. Chosen in
// onboarding (changeable in Power Up), persisted on-device. Each persona maps
// to the systems they already use, the first thing to connect, and what
// Counsel should brag about first. From the competitive research: these five
// personas all live in vertical tools that stop at charts — Counsel is the
// layer that reads them and says what to do.

export interface Persona {
  id: string;
  label: string;
  icon: string;
  systems: string; // what they already use (from research)
  firstConnect: string; // the wedge source
  leadInsight: string; // what Counsel leads with for them
  quickStart: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: "foodtruck",
    label: "Food truck / mobile food",
    icon: "🚚",
    systems: "Square · cash sales · Instagram",
    firstConnect: "Square export (or sales CSV)",
    leadInsight: "cash-crunch early warning around payroll + day-of-week truth",
    quickStart: [
      "Drop your Square sales export into Power Up",
      "Check the cash sentry (Plan) — payroll-aware, banded",
      "See your strongest days (Ops → staffing) before you set next week's pitch schedule",
    ],
  },
  {
    id: "landscaper",
    label: "Landscaping / lawn care",
    icon: "🌱",
    systems: "Jobber · Housecall Pro · QuickBooks",
    firstConnect: "Jobber export (or invoices CSV)",
    leadInsight: "job profitability + seasonality your field app never shows",
    quickStart: [
      "Export jobs/invoices from Jobber → drop into Power Up",
      "Rehearse the next hire in Plan (worst-month stress test)",
      "Track weather-season rhythm in Insights (season-adjusted reads)",
    ],
  },
  {
    id: "contractor",
    label: "General contractor",
    icon: "🔨",
    systems: "Housecall Pro · QuickBooks · spreadsheets",
    firstConnect: "invoices CSV (AR aging)",
    leadInsight: "who owes you (AR chase order) + cash runway between draws",
    quickStart: [
      "Load invoices into Power Up — the Money screen builds your chase list",
      "Stress-test equipment purchases in Plan before you commit",
      "Watch the cash calendar around materials + payroll dates",
    ],
  },
  {
    id: "restaurant",
    label: "Restaurant / café",
    icon: "🍽",
    systems: "Toast · Square · MarginEdge",
    firstConnect: "POS export (or sales CSV)",
    leadInsight: "season-adjusted daily reads + cost drift — without the $330/mo tool",
    quickStart: [
      "Drop your POS sales export into Power Up",
      "Check day-of-week staffing vs your real rhythm (Ops)",
      "Let the audit hunt fee drift + subscription creep (Insights)",
    ],
  },
  {
    id: "maker",
    label: "Etsy / handmade maker",
    icon: "🏺",
    systems: "Etsy · Shopify · Craftybase",
    firstConnect: "Etsy order export (or sales CSV)",
    leadInsight: "honest restock math + price power — real numbers, not estimates",
    quickStart: [
      "Drop your Etsy order export into Power Up",
      "See restock quantities that free up cash (Insights → newsvendor)",
      "Log your posts in Marketing — measure which ones actually sell",
    ],
  },
  {
    id: "other",
    label: "Something else",
    icon: "◆",
    systems: "whatever you run today",
    firstConnect: "sales CSV",
    leadInsight: "the honest read: what changed, what's normal, what to do",
    quickStart: [
      "Drop a sales CSV into Power Up (date + amount is enough)",
      "Read the brief on Today — cited, banded, honest",
      "Rehearse your next decision in Plan before you make it",
    ],
  },
];

const KEY = "counsel.persona";

export function getPersona(): Persona | null {
  try {
    const id = localStorage.getItem(KEY);
    return PERSONAS.find((p) => p.id === id) ?? null;
  } catch {
    return null;
  }
}

export function setPersona(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* preference just won't persist */
  }
}

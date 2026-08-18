// persona.ts — who the owner IS shapes what Counsel leads with. Chosen in
// onboarding (changeable in Power Up), persisted on-device. Each persona maps
// to the systems that business line actually uses, the first thing to
// connect, and what Counsel should brag about first. Grouped for the picker.

export interface Persona {
  id: string;
  group: string;
  label: string;
  icon: string;
  systems: string; // what they already use
  firstConnect: string; // the wedge source
  leadInsight: string; // what Counsel leads with for them
  quickStart: string[];
  /** Today's "Go deeper" tile order for this line of work (tile keys:
   *  insights · money · ops · decisions · marketing). Omit = default. */
  deeper?: string[];
}

const QS = {
  sales: (src: string) => `Drop your ${src} into Power Up (on-device, never uploaded)`,
  sentry: "Check the cash sentry (Plan) — payroll-aware, honestly banded",
  staffing: "Match staffing to your real weekly rhythm (Ops)",
  ar: "Load invoices — the Money screen builds your chase order",
  restock: "See restock quantities that free up cash (Insights)",
  audit: "Let the audit hunt duplicate charges, creep and fee drift (Insights)",
  rehearse: "Rehearse the next hire or purchase in Plan (worst-month stress test)",
  posts: "Log posts in Marketing — measure which ones actually sell",
  season: "Read your season-adjusted trend before panicking about a slow week (Insights)",
  worth: "Test past decisions with “Was it worth it?” (Plan)",
};

export const PERSONAS: Persona[] = [
  // ───────────── Food & drink ─────────────
  { id: "foodtruck", group: "Food & drink", label: "Food truck / cart", icon: "🚚",
    systems: "Square · cash sales · Instagram", firstConnect: "Square export (or sales CSV)",
    leadInsight: "cash-crunch warning around payroll + which days/pitches actually pay",
    quickStart: [QS.sales("Square sales export"), QS.sentry, QS.staffing] },
  { id: "restaurant", group: "Food & drink", label: "Restaurant", icon: "🍽",
    systems: "Toast · 7shifts · invoices", firstConnect: "POS export (or sales CSV)",
    leadInsight: "season-adjusted daily reads + cost drift — without the $330/mo tool",
    quickStart: [QS.sales("POS sales export"), QS.staffing, QS.audit] },
  { id: "cafe", group: "Food & drink", label: "Coffee shop / café", icon: "☕",
    systems: "Square · beans suppliers · Instagram", firstConnect: "Square export (or sales CSV)",
    leadInsight: "morning-rush staffing + price power on your core drinks",
    quickStart: [QS.sales("Square sales export"), QS.staffing, "Test a price move on one drink and measure it (Plan → Was it worth it?)"] },
  { id: "bakery", group: "Food & drink", label: "Bakery", icon: "🥐",
    systems: "Square · wholesale invoices", firstConnect: "sales CSV + invoices",
    leadInsight: "bake-quantity math (stock for demand, not hope) + wholesale AR chase",
    quickStart: [QS.sales("sales export"), QS.restock, QS.ar] },
  { id: "bar", group: "Food & drink", label: "Bar / brewery", icon: "🍺",
    systems: "Toast/Square · distributors", firstConnect: "POS export (or sales CSV)",
    leadInsight: "pour-cost drift + weekend staffing truth",
    quickStart: [QS.sales("POS export"), QS.audit, QS.staffing] },
  { id: "catering", group: "Food & drink", label: "Catering", icon: "🥂",
    systems: "invoices · HoneyBook · spreadsheets", firstConnect: "invoices CSV",
    leadInsight: "deposit-to-event cash timing + who still owes you",
    quickStart: [QS.ar, QS.sentry, QS.rehearse] },
  { id: "ghostkitchen", group: "Food & drink", label: "Ghost kitchen / delivery", icon: "🛵",
    systems: "DoorDash/UberEats · POS", firstConnect: "platform payout export",
    leadInsight: "platform-fee drift (they creep) + which menu items carry you",
    quickStart: [QS.sales("payout export"), QS.audit, QS.season] },

  // ───────────── Music & entertainment ─────────────
  { id: "songwriter", group: "Music & entertainment", label: "Singer-songwriter", icon: "🎤",
    systems: "gig payouts · Square merch table · DistroKid/TuneCore · BMI/ASCAP statements",
    firstConnect: "gig payouts CSV (or Square merch export)",
    leadInsight: "feast-famine smoothing between gigs + which stream actually pays: shows, merch, or royalties",
    quickStart: [QS.sales("gig payout / merch export"), QS.sentry, QS.worth],
    deeper: ["money", "marketing", "decisions", "insights", "ops"] },
  { id: "band", group: "Music & entertainment", label: "Band / touring act", icon: "🎸",
    systems: "show settlements · Square merch · Bandcamp · DistroKid",
    firstConnect: "settlements/merch CSV",
    leadInsight: "per-show economics after travel + merch-per-head truth by room",
    quickStart: [QS.sales("settlement/merch export"), QS.audit, QS.rehearse],
    deeper: ["money", "ops", "marketing", "decisions", "insights"] },
  { id: "producer", group: "Music & entertainment", label: "Producer / engineer", icon: "🎚️",
    systems: "session invoices · Stripe/Venmo · a drawer of plugin subscriptions",
    firstConnect: "invoices CSV",
    leadInsight: "session-rate utilization + subscription creep hiding in the plugin drawer",
    quickStart: [QS.ar, QS.audit, QS.sentry],
    deeper: ["money", "insights", "decisions", "marketing", "ops"] },

  // ───────────── Trades & field services ─────────────
  { id: "landscaper", group: "Trades & field", label: "Landscaping / lawn care", icon: "🌱",
    systems: "Jobber · QuickBooks", firstConnect: "Jobber export (or invoices CSV)",
    leadInsight: "job profitability + the seasonality your field app never shows",
    quickStart: ["Export jobs/invoices from Jobber → drop into Power Up", QS.rehearse, QS.season] },
  { id: "contractor", group: "Trades & field", label: "General contractor", icon: "🔨",
    systems: "Housecall Pro · QuickBooks · spreadsheets", firstConnect: "invoices CSV (AR aging)",
    leadInsight: "who owes you (chase order) + cash runway between draws",
    quickStart: [QS.ar, QS.rehearse, QS.sentry] },
  { id: "plumber", group: "Trades & field", label: "Plumbing", icon: "🔧",
    systems: "Housecall Pro · ServiceTitan (if big)", firstConnect: "jobs/invoices export",
    leadInsight: "emergency-call pricing power + van/tech profitability",
    quickStart: [QS.sales("jobs export"), "Test whether your emergency rate has room (Insights → price power)", QS.ar] },
  { id: "electrician", group: "Trades & field", label: "Electrical", icon: "⚡",
    systems: "Jobber/Housecall Pro · QuickBooks", firstConnect: "jobs/invoices export",
    leadInsight: "bid-to-actual margins + material-cost creep",
    quickStart: [QS.sales("jobs export"), QS.audit, QS.rehearse] },
  { id: "hvac", group: "Trades & field", label: "HVAC", icon: "❄️",
    systems: "ServiceTitan/Housecall Pro", firstConnect: "jobs/invoices export",
    leadInsight: "the season swing (install summer, service winter) read honestly",
    quickStart: [QS.sales("jobs export"), QS.season, QS.sentry] },
  { id: "cleaning", group: "Trades & field", label: "Cleaning service", icon: "🧹",
    systems: "Jobber · Venmo/Square · spreadsheets", firstConnect: "sales CSV",
    leadInsight: "client churn risk (who's about to quietly leave) + route staffing",
    quickStart: [QS.sales("sales export"), "See which clients are past their usual booking gap (Insights → at-risk)", QS.staffing] },
  { id: "painting", group: "Trades & field", label: "Painting", icon: "🎨",
    systems: "Jobber · QuickBooks", firstConnect: "jobs/invoices export",
    leadInsight: "quote-to-cash speed + crew-day profitability",
    quickStart: [QS.sales("jobs export"), QS.ar, QS.rehearse] },
  { id: "roofing", group: "Trades & field", label: "Roofing", icon: "🏠",
    systems: "JobNimbus/AccuLynx · QuickBooks", firstConnect: "invoices CSV",
    leadInsight: "storm-season cash swings + supplier-cost drift",
    quickStart: [QS.ar, QS.season, QS.audit] },
  { id: "handyman", group: "Trades & field", label: "Handyman", icon: "🪛",
    systems: "Square/Venmo · calendar", firstConnect: "sales CSV",
    leadInsight: "which job types pay best per hour — and which to stop taking",
    quickStart: [QS.sales("sales export"), QS.worth, QS.sentry] },
  { id: "poolservice", group: "Trades & field", label: "Pool service", icon: "🏊",
    systems: "Skimmer · QuickBooks", firstConnect: "invoices/route export",
    leadInsight: "route density economics + chemical-cost creep",
    quickStart: [QS.sales("route/invoice export"), QS.audit, QS.season] },
  { id: "pestcontrol", group: "Trades & field", label: "Pest control", icon: "🐜",
    systems: "FieldRoutes/Jobber", firstConnect: "jobs/invoices export",
    leadInsight: "recurring-contract retention (who's lapsing) + seasonal staffing",
    quickStart: [QS.sales("jobs export"), "Spot lapsing recurring customers before they churn (Insights)", QS.staffing] },
  { id: "autoshop", group: "Trades & field", label: "Auto repair / detailing", icon: "🚗",
    systems: "Shop-Ware/Square · parts suppliers", firstConnect: "sales CSV",
    leadInsight: "bay utilization by weekday + parts-cost drift",
    quickStart: [QS.sales("sales export"), QS.staffing, QS.audit] },
  { id: "towing", group: "Trades & field", label: "Towing / roadside", icon: "🛻",
    systems: "dispatch app · Square", firstConnect: "sales CSV",
    leadInsight: "call-volume rhythm (night/weekend truth) + per-truck economics",
    quickStart: [QS.sales("sales export"), QS.staffing, QS.sentry] },

  // ───────────── Retail & products ─────────────
  { id: "maker", group: "Retail & products", label: "Etsy / handmade maker", icon: "🏺",
    systems: "Etsy · Shopify · Craftybase", firstConnect: "Etsy order export",
    leadInsight: "honest restock math + price power — real numbers, not estimates",
    quickStart: [QS.sales("Etsy order export"), QS.restock, QS.posts] },
  { id: "ecommerce", group: "Retail & products", label: "Ecommerce (Shopify)", icon: "🛒",
    systems: "Shopify · Klaviyo · Meta ads", firstConnect: "Shopify order export",
    leadInsight: "which channel actually converts + ad-spend lift measured honestly",
    quickStart: [QS.sales("Shopify order export"), QS.posts, QS.restock] },
  { id: "boutique", group: "Retail & products", label: "Boutique / retail store", icon: "👗",
    systems: "Square/Shopify POS · Instagram", firstConnect: "POS export",
    leadInsight: "inventory cash-trap detection + foot-traffic day rhythm",
    quickStart: [QS.sales("POS export"), QS.restock, QS.staffing] },
  { id: "marketvendor", group: "Retail & products", label: "Farmers-market vendor", icon: "🍅",
    systems: "Square · cash · Instagram", firstConnect: "Square export",
    leadInsight: "which markets earn their booth fee — and which don't",
    quickStart: [QS.sales("Square export"), QS.worth, QS.posts] },
  { id: "reseller", group: "Retail & products", label: "Reseller (eBay/Posh/Amazon)", icon: "📦",
    systems: "eBay/Poshmark/Amazon · spreadsheets", firstConnect: "platform sales export",
    leadInsight: "true margin after fees (they drift) + dead-stock cash recovery",
    quickStart: [QS.sales("platform export"), QS.audit, QS.restock] },
  { id: "subscriptionbox", group: "Retail & products", label: "Subscription box", icon: "🎁",
    systems: "Shopify/Cratejoy · Stripe", firstConnect: "Stripe/subscriber export",
    leadInsight: "churn survival curves + box-cost creep vs price",
    quickStart: [QS.sales("subscriber export"), "See when subscribers typically lapse — and who's in the window now (Insights)", QS.audit] },
  { id: "foodproducer", group: "Retail & products", label: "Food producer / CPG", icon: "🫙",
    systems: "Shopify · wholesale invoices · co-packer", firstConnect: "orders + invoices CSV",
    leadInsight: "wholesale AR chase + batch-size math",
    quickStart: [QS.ar, QS.restock, QS.sentry] },

  // ───────────── Appointments & studios ─────────────
  { id: "salon", group: "Appointments & studios", label: "Salon / barber", icon: "💈",
    systems: "Square Appointments · Booksy · Instagram", firstConnect: "booking/sales export",
    leadInsight: "chair utilization by weekday + clients quietly lapsing",
    quickStart: [QS.sales("booking export"), QS.staffing, "Spot regulars past their usual visit gap (Insights → at-risk)"] },
  { id: "spa", group: "Appointments & studios", label: "Spa / massage", icon: "💆",
    systems: "Vagaro/Mindbody · Square", firstConnect: "booking/sales export",
    leadInsight: "rebooking-rate truth + package pricing power",
    quickStart: [QS.sales("booking export"), "Measure whether packages actually retain (Plan → Was it worth it?)", QS.staffing] },
  { id: "gym", group: "Appointments & studios", label: "Gym / personal training", icon: "🏋️",
    systems: "Mindbody/Trainerize · Stripe", firstConnect: "membership/sales export",
    leadInsight: "member churn curves + class-time utilization",
    quickStart: [QS.sales("membership export"), "See when members typically lapse — who's in the window now (Insights)", QS.staffing] },
  { id: "photographer", group: "Appointments & studios", label: "Photographer", icon: "📷",
    systems: "HoneyBook · Stripe · Instagram", firstConnect: "invoices CSV",
    leadInsight: "deposit-to-shoot cash timing + season booking rhythm",
    quickStart: [QS.ar, QS.season, QS.posts] },
  { id: "petcare", group: "Appointments & studios", label: "Pet grooming / boarding", icon: "🐕",
    systems: "Gingr/Square · Instagram", firstConnect: "booking/sales export",
    leadInsight: "capacity utilization + regulars overdue for a visit",
    quickStart: [QS.sales("booking export"), "Spot regulars past their usual gap (Insights → at-risk)", QS.staffing] },
  { id: "tutoring", group: "Appointments & studios", label: "Tutoring / lessons", icon: "📚",
    systems: "Calendly · Venmo/Stripe", firstConnect: "sales CSV",
    leadInsight: "student retention curves + school-year seasonality",
    quickStart: [QS.sales("payments export"), QS.season, QS.sentry] },
  { id: "studio", group: "Appointments & studios", label: "Dance / music studio", icon: "🎵",
    systems: "Mindbody · Stripe · spreadsheets", firstConnect: "enrollment/sales export",
    leadInsight: "enrollment cliffs (semester rhythm) + room utilization",
    quickStart: [QS.sales("enrollment export"), QS.season, QS.rehearse] },

  // ───────────── Professional services ─────────────
  { id: "freelancer", group: "Professional services", label: "Freelancer / consultant", icon: "💻",
    systems: "Stripe · Wave · spreadsheets", firstConnect: "invoices CSV",
    leadInsight: "feast-famine smoothing (banded pipeline) + who pays late",
    quickStart: [QS.ar, QS.sentry, QS.worth] },
  { id: "agency", group: "Professional services", label: "Marketing / creative agency", icon: "🎯",
    systems: "QuickBooks · Stripe · Harvest", firstConnect: "invoices CSV",
    leadInsight: "client concentration risk + retainer vs project cash rhythm",
    quickStart: [QS.ar, QS.sentry, QS.rehearse] },
  { id: "realestate", group: "Professional services", label: "Real estate agent", icon: "🏡",
    systems: "commissions · spreadsheets", firstConnect: "commissions CSV",
    leadInsight: "commission-gap survival math (the honest between-closings runway)",
    quickStart: [QS.sales("commissions export"), QS.sentry, QS.season] },
  { id: "therapist", group: "Professional services", label: "Therapist / counselor", icon: "🛋",
    systems: "SimplePractice · Stripe", firstConnect: "session/payment export",
    leadInsight: "caseload utilization + no-show cost truth",
    quickStart: [QS.sales("payments export"), QS.staffing, QS.sentry] },
  { id: "bookkeeper", group: "Professional services", label: "Bookkeeper / accountant", icon: "🧾",
    systems: "QuickBooks · Xero · your own books", firstConnect: "invoices CSV",
    leadInsight: "your own AR (the cobbler's shoes) + seasonal crunch staffing",
    quickStart: [QS.ar, QS.season, QS.rehearse] },

  // ───────────── Property & transport ─────────────
  { id: "landlord", group: "Property & transport", label: "Landlord / property manager", icon: "🏢",
    systems: "rent rolls · bank exports · spreadsheets", firstConnect: "rent roll CSV",
    leadInsight: "late-rent patterns + maintenance-cost creep per unit",
    quickStart: [QS.sales("rent roll export"), QS.audit, QS.sentry] },
  { id: "str", group: "Property & transport", label: "Short-term rental host", icon: "🛏",
    systems: "Airbnb/VRBO · PriceLabs", firstConnect: "payout export",
    leadInsight: "season pricing power + platform-fee drift",
    quickStart: [QS.sales("Airbnb payout export"), QS.season, QS.audit] },
  { id: "trucker", group: "Property & transport", label: "Owner-operator trucking", icon: "🚛",
    systems: "load boards · fuel cards · QuickBooks", firstConnect: "settlements CSV",
    leadInsight: "per-mile economics + fuel/fee creep against rates",
    quickStart: [QS.sales("settlements export"), QS.audit, QS.sentry] },
  { id: "eventplanner", group: "Property & transport", label: "Event planning / rentals", icon: "🎪",
    systems: "HoneyBook · invoices · Square", firstConnect: "invoices CSV",
    leadInsight: "deposit cash timing + season booking cliffs",
    quickStart: [QS.ar, QS.season, QS.rehearse] },

  // ───────────── Fallback ─────────────
  { id: "other", group: "Something else", label: "Something else", icon: "◆",
    systems: "whatever you run today", firstConnect: "sales CSV",
    leadInsight: "the honest read: what changed, what's normal, what to do",
    quickStart: [QS.sales("sales CSV (date + amount is enough)"), "Read the brief on Today — cited, banded, honest", QS.rehearse] },
];

export const PERSONA_GROUPS = [...new Set(PERSONAS.map((p) => p.group))];

const KEY = "counsel.persona";
const NAME_KEY = "counsel.businessName";

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
  } catch { /* preference just won't persist */ }
}

/** The REAL business name (onboarding input). Demo fallback elsewhere. */
export function getBusinessName(): string | null {
  try {
    const v = localStorage.getItem(NAME_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setBusinessName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 60));
  } catch { /* fine */ }
}

export function displayName(): string {
  const real = getBusinessName();
  if (real) return real;
  // Demo businesses match the chosen line of work — a restaurateur tours
  // a restaurant, a landscaper a crew, a songwriter a merch table.
  const g = getPersona()?.group;
  if (g === "Food & drink") return "Ember & Oak";
  if (g === "Trades & field") return "GreenLine Yards";
  if (g === "Music & entertainment") return "The Wren Sessions";
  return "Kiln & Co.";
}

/** The demo ledger's headline product, matched to the chosen line of work
 *  (authored demo copy interpolates this so a restaurateur never reads
 *  about pottery). */
export function demoStarProduct(): string {
  const g = getPersona()?.group;
  if (g === "Food & drink") return "Smash Burger";
  if (g === "Trades & field") return "Lawn Care Visit";
  if (g === "Music & entertainment") return "Merch Tee";
  return "Sunset Mug";
}

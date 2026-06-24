/**
 * EAGOH Intelligence Domains service.
 *
 * Each EAGOH is forged with exactly ONE intelligence domain. The EAGOH can
 * only answer questions within that domain — out-of-domain requests are
 * politely rejected with a suggestion to create or select a domain-matching
 * EAGOH.
 */

export type IntelligenceDomain = {
  id: string;
  label: string;
  description: string;
  icon: string; // lucide icon name for UI rendering
  tone: "cyan" | "gold" | "violet" | "ember" | "success";
  color: string; // brand-accent hex for domain badges / accents
};

export const INTELLIGENCE_DOMAINS: IntelligenceDomain[] = [
  { id: "sports", label: "Sports", description: "Game analysis, player performance, tactical breakdowns, and athletic intelligence.", icon: "Trophy", tone: "gold", color: "#3B82F6" },
  { id: "music", label: "Music", description: "Genre analysis, artist insights, production techniques, and sound culture.", icon: "Music", tone: "violet", color: "#A855F7" },
  { id: "film-tv", label: "Film & Television", description: "Screen analysis, narrative structure, character study, and visual storytelling.", icon: "Film", tone: "ember", color: "#EF4444" },
  { id: "fashion", label: "Fashion", description: "Style analysis, trend forecasting, design language, and aesthetic intelligence.", icon: "Shirt", tone: "cyan", color: "#F59E0B" },
  { id: "education", label: "Education", description: "Learning systems, curriculum design, knowledge transfer, and academic strategy.", icon: "GraduationCap", tone: "success", color: "#22C55E" },
  { id: "gaming", label: "Gaming", description: "Game mechanics, meta analysis, esports strategy, and interactive design.", icon: "Gamepad2", tone: "violet", color: "#06B6D4" },
  { id: "business", label: "Business", description: "Market strategy, operations, entrepreneurship, and commercial intelligence.", icon: "Briefcase", tone: "gold", color: "#94A3B8" },
  { id: "finance", label: "Finance", description: "Market analysis, investment strategy, risk assessment, and economic insight.", icon: "LineChart", tone: "success", color: "#10B981" },
  { id: "technology", label: "Technology", description: "Software architecture, hardware analysis, emerging tech, and digital strategy.", icon: "Cpu", tone: "cyan", color: "#0EA5E9" },
  { id: "health-fitness", label: "Health & Fitness", description: "Training science, nutrition strategy, biometric analysis, and wellness intelligence.", icon: "Heart", tone: "ember", color: "#F97316" },
];

/** Look up a domain by id. Returns undefined for unknown ids. */
export function getDomain(domainId: string): IntelligenceDomain | undefined {
  return INTELLIGENCE_DOMAINS.find((d) => d.id === domainId);
}

/**
 * Check whether a user prompt falls within the given domain.
 * Uses keyword-based detection — simple, fast, and no API call needed.
 */
export function isPromptInDomain(prompt: string, domainId: string): boolean {
  const domain = getDomain(domainId);
  if (!domain) return false;

  const lower = prompt.toLowerCase();
  const keywords = DOMAIN_KEYWORDS[domainId] ?? [];
  if (keywords.length === 0) return true; // unknown domain → allow

  return keywords.some((kw) => lower.includes(kw));
}

/** Get the brand-accent hex color for a domain. */
export function getDomainColor(domainId: string): string {
  const domain = getDomain(domainId);
  return domain?.color ?? "#6B7280";
}

/** Generate a polite out-of-domain rejection message. */
export function getDomainRejection(domainId: string): string {
  const domain = getDomain(domainId);
  const domainLabel = domain?.label ?? domainId;
  const suggestions = INTELLIGENCE_DOMAINS.filter((d) => d.id !== domainId)
    .slice(0, 3)
    .map((d) => d.label)
    .join(", ");

  return `I'm forged for ${domainLabel} intelligence only. This question falls outside my domain. Try creating or selecting an EAGOH tuned for one of these domains: ${suggestions}.`;
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  sports: ["game", "match", "player", "team", "score", "win", "loss", "championship", "league", "tournament", "coach", "tactic", "play", "athlete", "stadium", "season", "quarter", "half", "goal", "touchdown", "basket", "defense", "offense", "training", "draft", "trade", "rivalry", "playoff", "final", "sport"],
  music: ["song", "album", "artist", "band", "beat", "rhythm", "melody", "genre", "concert", "tour", "lyric", "verse", "chorus", "producer", "instrument", "vocal", "track", "release", "stream", "playlist", "radio", "label", "studio", "recording", "mix", "sound", "bass", "drum", "guitar", "piano"],
  "film-tv": ["movie", "film", "show", "episode", "actor", "director", "scene", "script", "plot", "character", "cinema", "tv", "series", "season", "premiere", "screen", "camera", "trailer", "cast", "role", "drama", "comedy", "thriller", "documentary", "animation", "netflix", "hbo", "streaming", "oscar", "award"],
  fashion: ["style", "fashion", "wear", "outfit", "designer", "brand", "collection", "runway", "trend", "fabric", "textile", "shoe", "dress", "suit", "jacket", "accessory", "luxury", "streetwear", "couture", "vogue", "seasonal", "aesthetic", "look", "model", "fit", "tailor", "garment", "label"],
  education: ["learn", "teach", "student", "school", "university", "college", "course", "class", "lesson", "curriculum", "degree", "professor", "academic", "study", "exam", "test", "grade", "education", "training", "lecture", "textbook", "research", "knowledge", "skill", "certificate", "diploma", "homework", "tutor", "online course"],
  gaming: ["game", "gaming", "esports", "player", "level", "boss", "quest", "rpg", "fps", "mmo", "console", "pc", "steam", "xbox", "playstation", "nintendo", "twitch", "stream", "speedrun", "meta", "patch", "update", "dlc", "character", "class", "build", "loot", "raid", "rank", "competitive"],
  business: ["business", "company", "startup", "revenue", "profit", "market", "strategy", "ceo", "founder", "entrepreneur", "sales", "marketing", "growth", "funding", "investor", "venture", "ipo", "acquisition", "merger", "brand", "product", "customer", "pipeline", "roi", "kpi", "stakeholder", "board", "operational", "scale"],
  finance: ["stock", "market", "invest", "trade", "crypto", "bitcoin", "portfolio", "dividend", "bond", "fund", "etf", "index", "nasdaq", "sp500", "forex", "option", "futures", "hedge", "risk", "capital", "asset", "liability", "equity", "debt", "interest rate", "inflation", "recession", "bull", "bear", "wallet"],
  technology: ["code", "software", "hardware", "app", "api", "cloud", "server", "database", "algorithm", "ai", "machine learning", "blockchain", "web", "mobile", "frontend", "backend", "devops", "cybersecurity", "iot", "data", "network", "protocol", "framework", "library", "sdk", "compiler", "debug", "deploy", "scale"],
  "health-fitness": ["workout", "exercise", "diet", "nutrition", "calorie", "protein", "muscle", "cardio", "yoga", "run", "gym", "fitness", "health", "wellness", "sleep", "recovery", "injury", "weight", "body", "heart rate", "step", "hydration", "supplement", "vitamin", "meditation", "stress", "flexibility", "strength", "endurance"],
};

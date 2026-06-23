/**
 * EAGOH image prompt builder.
 *
 * Pure, structured prompt construction from forge inputs. No network calls.
 * Every prompt enforces:
 *  - transparent background
 *  - full-body render
 *  - isolated subject only (no environments)
 *  - no team logos, no copyrighted imagery, no real athlete likeness
 *  - futuristic cybernetic premium aesthetic
 *
 * Reusable for initial forge, full reforge, and partial reforge prompts.
 */

export type ForgePromptInput = {
  name?: string;
  sport: string;
  gender?: string | null;
  dna: string[];
  teams: string[];
  appearance: Record<string, string>; // headwear / body / footwear / accessories / ...
  cyberneticIntensity: string;
  pose: string;
  lab?: string | null;
};

export type ForgePromptOptions = {
  /** Limits the prompt to just the changed surface (partial reforge). */
  scope?: "full" | "headwear" | "body" | "footwear" | "accessories" | "pose" | "cybernetic";
};

const SPORT_CUES: Record<string, string> = {
  football: "powerful build, gridiron silhouette cues, no jersey logos",
  basketball: "lean explosive frame, court-ready silhouette, no jersey logos",
  soccer: "agile mid-pace build, pitch-ready silhouette, no kit logos",
  baseball: "balanced compact frame, diamond-ready silhouette, no team logos",
};

const INTENSITY_CUES: Record<string, string> = {
  minimal: "subtle neural seams along the jawline and forearms, restrained chrome accents",
  moderate: "visible cybernetic optic glow, sleek alloy plating on shoulders and forearms",
  heavy: "reinforced cybernetic limbs, exposed circuit traces, layered alloy chest plating",
  assimilated: "full machine-myth conversion, dense armored plating, glowing core lattice, only human eyes visible",
};

const POSE_CUES: Record<string, string> = {
  "arms-crossed": "standing tall, arms crossed, unshaken authority pose, facing camera",
  "strategist-stance": "calm mid-call calculation pose, one hand at chin, body slightly angled",
  "relaxed-confidence": "relaxed standing pose, hands at sides, premium calm presence",
  "tactical-stance": "ready-to-deploy tactical stance, weight balanced, slight forward lean",
};

const DNA_CUES: Record<string, string> = {
  oracle: "predictive analyst aura, cool cyan accent lighting",
  enforcer: "dominant enforcer aura, ember-red accent lighting",
  strategist: "tactical strategist aura, violet accent lighting",
  icon: "magnetic icon aura, gold accent lighting",
  phantom: "stealth phantom aura, deep teal accent lighting",
};

const APPEARANCE_LABELS: Record<string, Record<string, string>> = {
  headwear: {
    "cowboy-hat": "a sculpted modern cowboy hat",
    "tactical-hood": "a low tactical hood",
    "cyber-helmet": "a sleek visor-cyber helmet",
    "sports-visor": "a wraparound sports visor",
  },
  body: {
    "football-pads": "fictional armored shoulder pads (no logos, no team colors)",
    "tactical-jacket": "a fitted tactical jacket with utility seams",
    "cyber-armor": "form-fitting cyber armor with layered alloy plates",
    "sports-gear": "fictional performance athletic gear (no logos)",
  },
  footwear: {
    "running-shoes": "futuristic running shoes with neon sole accents",
    "tactical-boots": "reinforced tactical boots",
    "futuristic-cleats": "futuristic cleats with carbon plating",
  },
  accessories: {
    "diamond-chains": "premium diamond chains",
    watches: "an oversized cybernetic wrist module",
    rings: "stacked metallic rings",
    pendants: "a glowing pendant",
    visors: "an angular optical visor",
  },
};

const GENDER_CUES: Record<string, string> = {
  masculine: "masculine-presenting build",
  feminine: "feminine-presenting build",
  androgynous: "androgynous build",
  nonbinary: "non-binary build",
};

function describeAppearance(appearance: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [category, value] of Object.entries(appearance)) {
    const label = APPEARANCE_LABELS[category]?.[value];
    if (label) out.push(label);
  }
  return out;
}

function describeDna(dna: string[]): string {
  const phrases = dna.map((id) => DNA_CUES[id]).filter(Boolean);
  return phrases.join(", ");
}

function describeTeams(teams: string[]): string {
  if (teams.length === 0) return "";
  // Fanatic team themes are mood/lighting cues only — never logos, never real teams.
  return `subtle fictional faction lighting hint (no logos, no real team marks): ${teams.length} affinity layer${teams.length === 1 ? "" : "s"}`;
}

const NEGATIVE_GUARDRAILS =
  "Absolutely no team logos, no league marks, no recognizable real athlete likeness, no copyrighted brand iconography, no stadium or environment, no background scene, no shadows on the floor, no text, no watermark.";

const POSITIVE_FRAMING =
  "Full-body character render, isolated subject only on a fully transparent background, centered, head-to-toe visible, photographic premium quality, sharp edges, cinematic rim lighting, futuristic cybernetic style, collectible-grade tactical character art, identity-driven, mobile-optimized clean silhouette.";

/**
 * Build a structured prompt string from forge inputs.
 *
 * Scope variants enable partial reforges where only a single surface (e.g. footwear)
 * is described in detail while the rest stays as a brief identity anchor.
 */
export function buildForgePrompt(input: ForgePromptInput, options: ForgePromptOptions = {}): string {
  const { scope = "full" } = options;
  const sportCue = SPORT_CUES[input.sport] ?? "premium athlete silhouette, no logos";
  const intensityCue = INTENSITY_CUES[input.cyberneticIntensity] ?? INTENSITY_CUES.moderate;
  const poseCue = POSE_CUES[input.pose] ?? POSE_CUES["relaxed-confidence"];
  const genderCue = input.gender ? GENDER_CUES[input.gender] ?? "balanced athletic build" : "balanced athletic build";
  const dnaCue = describeDna(input.dna);
  const teamCue = describeTeams(input.teams);
  const appearanceList = describeAppearance(input.appearance);

  const identityAnchor = [
    `EAGOH codename "${(input.name ?? "Unnamed EAGOH").slice(0, 48)}"`,
    `${input.sport} archetype`,
    genderCue,
  ].join(", ");

  if (scope === "full") {
    const body = [
      POSITIVE_FRAMING,
      identityAnchor,
      sportCue,
      `cybernetic intensity: ${intensityCue}`,
      `DNA traits: ${dnaCue || "balanced tactical signature"}`,
      teamCue,
      appearanceList.length ? `wearing ${appearanceList.join(", ")}` : "",
      `pose: ${poseCue}`,
      NEGATIVE_GUARDRAILS,
    ].filter(Boolean);
    return body.join(" — ");
  }

  // Partial reforge: tight, surface-focused prompt with identity anchor.
  const surface = (() => {
    if (scope === "headwear") return appearanceList.find((s) => s.includes("hat") || s.includes("hood") || s.includes("helmet") || s.includes("visor"));
    if (scope === "body") return appearanceList.find((s) => s.includes("pads") || s.includes("jacket") || s.includes("armor") || s.includes("gear"));
    if (scope === "footwear") return appearanceList.find((s) => s.includes("shoes") || s.includes("boots") || s.includes("cleats"));
    if (scope === "accessories") return appearanceList.filter((s) => s.includes("chain") || s.includes("ring") || s.includes("pendant") || s.includes("module") || s.includes("visor")).join(", ");
    if (scope === "pose") return `pose change to ${poseCue}`;
    if (scope === "cybernetic") return `cybernetic intensity change to ${intensityCue}`;
    return undefined;
  })();

  return [
    POSITIVE_FRAMING,
    identityAnchor,
    `partial reforge — focus surface: ${surface ?? scope}`,
    NEGATIVE_GUARDRAILS,
  ].join(" — ");
}

/** Summary lines for the confirmation flow — never sent to the image model. */
export function buildForgeSummary(input: ForgePromptInput): string[] {
  return [
    `Name: ${input.name?.trim() || "Unnamed EAGOH"}`,
    `Sport: ${input.sport}`,
    `Cybernetic intensity: ${input.cyberneticIntensity}`,
    `Pose: ${input.pose.replace(/-/g, " ")}`,
    `DNA: ${input.dna.length ? input.dna.join(" + ") : "none selected"}`,
    `Fanatic affinities: ${input.teams.length} selected`,
    `Appearance layers: ${Object.keys(input.appearance).length}`,
  ];
}

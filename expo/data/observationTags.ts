/**
 * Observation Tags — domain-specific category → subtag taxonomies for
 * Open Intelligence entries. Each domain gets its own set of categories
 * and subtags, matching the hierarchical architecture used by Sports.
 */

import type { TagCategory } from "@/services/openIntelligence";

// ── Sports (preserved exactly as existing) ────────────────────────────

const SPORTS_TAGS: TagCategory[] = [
  {
    id: "physical-performance",
    label: "Physical / Performance",
    tags: [
      { id: "injury", label: "Injury" },
      { id: "fatigue", label: "Fatigue" },
      { id: "conditioning", label: "Conditioning" },
      { id: "recovery", label: "Recovery" },
      { id: "mobility", label: "Mobility" },
      { id: "stamina", label: "Stamina" },
    ],
  },
  {
    id: "emotional-mental",
    label: "Emotional / Mental",
    tags: [
      { id: "frustration", label: "Frustration" },
      { id: "confidence", label: "Confidence" },
      { id: "pressure", label: "Pressure" },
      { id: "rivalry", label: "Rivalry" },
      { id: "motivation", label: "Motivation" },
      { id: "tilt", label: "Tilt" },
    ],
  },
  {
    id: "strategic",
    label: "Strategic",
    tags: [
      { id: "coaching", label: "Coaching" },
      { id: "rotation", label: "Rotation" },
      { id: "pace", label: "Pace" },
      { id: "matchup", label: "Matchup" },
      { id: "ball_dominance", label: "Ball Dominance" },
      { id: "defensive_scheme", label: "Defensive Scheme" },
    ],
  },
  {
    id: "environment",
    label: "Environment",
    tags: [
      { id: "crowd", label: "Crowd" },
      { id: "travel", label: "Travel" },
      { id: "weather", label: "Weather" },
      { id: "arena_energy", label: "Arena Energy" },
      { id: "national_tv", label: "National TV" },
      { id: "referees", label: "Referees" },
    ],
  },
  {
    id: "narrative",
    label: "Narrative",
    tags: [
      { id: "revenge_game", label: "Revenge Game" },
      { id: "media_pressure", label: "Media Pressure" },
      { id: "contract_year", label: "Contract Year" },
      { id: "team_drama", label: "Team Drama" },
      { id: "trade_rumors", label: "Trade Rumors" },
    ],
  },
  {
    id: "statistical",
    label: "Statistical",
    tags: [
      { id: "shooting", label: "Shooting" },
      { id: "fouls", label: "Fouls" },
      { id: "turnovers", label: "Turnovers" },
      { id: "clutch", label: "Clutch" },
      { id: "rebounding", label: "Rebounding" },
      { id: "defensive_impact", label: "Defensive Impact" },
    ],
  },
];

// ── Music ──────────────────────────────────────────────────────────────

const MUSIC_TAGS: TagCategory[] = [
  {
    id: "music-creative",
    label: "Creative",
    tags: [
      { id: "songwriting", label: "Songwriting" },
      { id: "composition", label: "Composition" },
      { id: "production", label: "Production" },
      { id: "arrangement", label: "Arrangement" },
      { id: "recording", label: "Recording" },
      { id: "sound_design", label: "Sound Design" },
    ],
  },
  {
    id: "music-performance",
    label: "Performance",
    tags: [
      { id: "vocals", label: "Vocals" },
      { id: "instrumental", label: "Instrumental" },
      { id: "stage_presence", label: "Stage Presence" },
      { id: "touring", label: "Touring" },
      { id: "rehearsal", label: "Rehearsal" },
    ],
  },
  {
    id: "music-industry",
    label: "Industry",
    tags: [
      { id: "marketing", label: "Marketing" },
      { id: "branding", label: "Branding" },
      { id: "distribution", label: "Distribution" },
      { id: "streaming", label: "Streaming" },
      { id: "social_media", label: "Social Media" },
      { id: "fan_engagement", label: "Fan Engagement" },
    ],
  },
  {
    id: "music-business",
    label: "Business",
    tags: [
      { id: "contracts", label: "Contracts" },
      { id: "royalties", label: "Royalties" },
      { id: "publishing", label: "Publishing" },
      { id: "management", label: "Management" },
      { id: "ar", label: "A&R" },
    ],
  },
  {
    id: "music-narrative",
    label: "Narrative",
    tags: [
      { id: "artist_story", label: "Artist Story" },
      { id: "public_image", label: "Public Image" },
      { id: "collaboration", label: "Collaboration" },
      { id: "creative_direction", label: "Creative Direction" },
    ],
  },
  {
    id: "music-analytics",
    label: "Analytics",
    tags: [
      { id: "streaming_numbers", label: "Streaming Numbers" },
      { id: "audience_growth", label: "Audience Growth" },
      { id: "engagement_metrics", label: "Engagement Metrics" },
      { id: "market_trends", label: "Market Trends" },
    ],
  },
];

// ── Film & Television ──────────────────────────────────────────────────

const FILM_TV_TAGS: TagCategory[] = [
  {
    id: "film-creative",
    label: "Creative",
    tags: [
      { id: "storytelling", label: "Storytelling" },
      { id: "screenwriting", label: "Screenwriting" },
      { id: "character_development", label: "Character Development" },
      { id: "world_building", label: "World Building" },
    ],
  },
  {
    id: "film-production",
    label: "Production",
    tags: [
      { id: "directing", label: "Directing" },
      { id: "cinematography", label: "Cinematography" },
      { id: "editing", label: "Editing" },
      { id: "visual_effects", label: "Visual Effects" },
    ],
  },
  {
    id: "film-performance",
    label: "Performance",
    tags: [
      { id: "acting", label: "Acting" },
      { id: "casting", label: "Casting" },
      { id: "improvisation", label: "Improvisation" },
    ],
  },
  {
    id: "film-industry",
    label: "Industry",
    tags: [
      { id: "distribution", label: "Distribution" },
      { id: "streaming", label: "Streaming" },
      { id: "marketing", label: "Marketing" },
      { id: "promotion", label: "Promotion" },
    ],
  },
  {
    id: "film-narrative",
    label: "Narrative",
    tags: [
      { id: "reviews", label: "Reviews" },
      { id: "audience_reception", label: "Audience Reception" },
      { id: "franchise_development", label: "Franchise Development" },
    ],
  },
  {
    id: "film-analytics",
    label: "Analytics",
    tags: [
      { id: "box_office", label: "Box Office" },
      { id: "ratings", label: "Ratings" },
      { id: "audience_metrics", label: "Audience Metrics" },
      { id: "awards", label: "Awards" },
    ],
  },
];

// ── Fashion ────────────────────────────────────────────────────────────

const FASHION_TAGS: TagCategory[] = [
  {
    id: "fashion-creative",
    label: "Creative",
    tags: [
      { id: "design", label: "Design" },
      { id: "styling", label: "Styling" },
      { id: "collection_planning", label: "Collection Planning" },
    ],
  },
  {
    id: "fashion-industry",
    label: "Industry",
    tags: [
      { id: "retail", label: "Retail" },
      { id: "branding", label: "Branding" },
      { id: "marketing", label: "Marketing" },
      { id: "fashion_week", label: "Fashion Week" },
    ],
  },
  {
    id: "fashion-trend",
    label: "Trend",
    tags: [
      { id: "streetwear", label: "Streetwear" },
      { id: "luxury", label: "Luxury" },
      { id: "seasonal_trends", label: "Seasonal Trends" },
    ],
  },
  {
    id: "fashion-business",
    label: "Business",
    tags: [
      { id: "manufacturing", label: "Manufacturing" },
      { id: "supply_chain", label: "Supply Chain" },
      { id: "merchandising", label: "Merchandising" },
    ],
  },
  {
    id: "fashion-narrative",
    label: "Narrative",
    tags: [
      { id: "influencer_culture", label: "Influencer Culture" },
      { id: "personal_brand", label: "Personal Brand" },
    ],
  },
  {
    id: "fashion-analytics",
    label: "Analytics",
    tags: [
      { id: "sales", label: "Sales" },
      { id: "consumer_behavior", label: "Consumer Behavior" },
      { id: "trend_forecasting", label: "Trend Forecasting" },
    ],
  },
];

// ── Education ──────────────────────────────────────────────────────────

const EDUCATION_TAGS: TagCategory[] = [
  {
    id: "education-learning",
    label: "Learning",
    tags: [
      { id: "study_techniques", label: "Study Techniques" },
      { id: "knowledge_retention", label: "Knowledge Retention" },
      { id: "research", label: "Research" },
    ],
  },
  {
    id: "education-teaching",
    label: "Teaching",
    tags: [
      { id: "instruction", label: "Instruction" },
      { id: "curriculum", label: "Curriculum" },
      { id: "assessment", label: "Assessment" },
    ],
  },
  {
    id: "education-performance",
    label: "Performance",
    tags: [
      { id: "academic_achievement", label: "Academic Achievement" },
      { id: "testing", label: "Testing" },
    ],
  },
  {
    id: "education-career",
    label: "Career",
    tags: [
      { id: "skill_development", label: "Skill Development" },
      { id: "professional_growth", label: "Professional Growth" },
    ],
  },
  {
    id: "education-narrative",
    label: "Narrative",
    tags: [
      { id: "student_experience", label: "Student Experience" },
      { id: "classroom_dynamics", label: "Classroom Dynamics" },
    ],
  },
  {
    id: "education-analytics",
    label: "Analytics",
    tags: [
      { id: "grades", label: "Grades" },
      { id: "progress_tracking", label: "Progress Tracking" },
      { id: "outcomes", label: "Outcomes" },
    ],
  },
];

// ── Business ───────────────────────────────────────────────────────────

const BUSINESS_TAGS: TagCategory[] = [
  {
    id: "business-leadership",
    label: "Leadership",
    tags: [
      { id: "team_management", label: "Team Management" },
      { id: "decision_making", label: "Decision Making" },
    ],
  },
  {
    id: "business-growth",
    label: "Growth",
    tags: [
      { id: "scaling", label: "Scaling" },
      { id: "operations", label: "Operations" },
      { id: "productivity", label: "Productivity" },
    ],
  },
  {
    id: "business-marketing",
    label: "Marketing",
    tags: [
      { id: "customer_acquisition", label: "Customer Acquisition" },
      { id: "branding", label: "Branding" },
      { id: "sales", label: "Sales" },
    ],
  },
  {
    id: "business-finance",
    label: "Finance",
    tags: [
      { id: "revenue", label: "Revenue" },
      { id: "expenses", label: "Expenses" },
      { id: "profitability", label: "Profitability" },
    ],
  },
  {
    id: "business-narrative",
    label: "Narrative",
    tags: [
      { id: "company_culture", label: "Company Culture" },
      { id: "reputation", label: "Reputation" },
    ],
  },
  {
    id: "business-analytics",
    label: "Analytics",
    tags: [
      { id: "kpis", label: "KPIs" },
      { id: "forecasting", label: "Forecasting" },
      { id: "market_analysis", label: "Market Analysis" },
    ],
  },
];

// ── Finance ────────────────────────────────────────────────────────────

const FINANCE_TAGS: TagCategory[] = [
  {
    id: "finance-investment",
    label: "Investment",
    tags: [
      { id: "stocks", label: "Stocks" },
      { id: "etfs", label: "ETFs" },
      { id: "real_estate", label: "Real Estate" },
    ],
  },
  {
    id: "finance-strategy",
    label: "Strategy",
    tags: [
      { id: "portfolio_management", label: "Portfolio Management" },
      { id: "risk_management", label: "Risk Management" },
    ],
  },
  {
    id: "finance-market",
    label: "Market",
    tags: [
      { id: "trends", label: "Trends" },
      { id: "macroeconomics", label: "Macroeconomics" },
    ],
  },
  {
    id: "finance-personal",
    label: "Personal Finance",
    tags: [
      { id: "budgeting", label: "Budgeting" },
      { id: "saving", label: "Saving" },
    ],
  },
  {
    id: "finance-narrative",
    label: "Narrative",
    tags: [
      { id: "investor_sentiment", label: "Investor Sentiment" },
    ],
  },
  {
    id: "finance-analytics",
    label: "Analytics",
    tags: [
      { id: "technical_analysis", label: "Technical Analysis" },
      { id: "fundamental_analysis", label: "Fundamental Analysis" },
    ],
  },
];

// ── Technology ─────────────────────────────────────────────────────────

const TECHNOLOGY_TAGS: TagCategory[] = [
  {
    id: "tech-development",
    label: "Development",
    tags: [
      { id: "software_engineering", label: "Software Engineering" },
      { id: "mobile_development", label: "Mobile Development" },
      { id: "web_development", label: "Web Development" },
    ],
  },
  {
    id: "tech-infrastructure",
    label: "Infrastructure",
    tags: [
      { id: "cloud", label: "Cloud" },
      { id: "devops", label: "DevOps" },
      { id: "networking", label: "Networking" },
    ],
  },
  {
    id: "tech-security",
    label: "Security",
    tags: [
      { id: "cybersecurity", label: "Cybersecurity" },
      { id: "privacy", label: "Privacy" },
    ],
  },
  {
    id: "tech-innovation",
    label: "Innovation",
    tags: [
      { id: "ai", label: "AI" },
      { id: "robotics", label: "Robotics" },
      { id: "automation", label: "Automation" },
    ],
  },
  {
    id: "tech-narrative",
    label: "Narrative",
    tags: [
      { id: "product_vision", label: "Product Vision" },
      { id: "startup_culture", label: "Startup Culture" },
    ],
  },
  {
    id: "tech-analytics",
    label: "Analytics",
    tags: [
      { id: "performance_metrics", label: "Performance Metrics" },
      { id: "usage_analytics", label: "Usage Analytics" },
    ],
  },
];

// ── Health & Fitness ───────────────────────────────────────────────────

const HEALTH_FITNESS_TAGS: TagCategory[] = [
  {
    id: "health-training",
    label: "Training",
    tags: [
      { id: "strength", label: "Strength" },
      { id: "cardio", label: "Cardio" },
      { id: "mobility", label: "Mobility" },
    ],
  },
  {
    id: "health-recovery",
    label: "Recovery",
    tags: [
      { id: "sleep", label: "Sleep" },
      { id: "injury_prevention", label: "Injury Prevention" },
    ],
  },
  {
    id: "health-nutrition",
    label: "Nutrition",
    tags: [
      { id: "diet", label: "Diet" },
      { id: "supplementation", label: "Supplementation" },
    ],
  },
  {
    id: "health-mental",
    label: "Mental",
    tags: [
      { id: "motivation", label: "Motivation" },
      { id: "discipline", label: "Discipline" },
    ],
  },
  {
    id: "health-narrative",
    label: "Narrative",
    tags: [
      { id: "lifestyle", label: "Lifestyle" },
      { id: "habits", label: "Habits" },
    ],
  },
  {
    id: "health-analytics",
    label: "Analytics",
    tags: [
      { id: "biometrics", label: "Biometrics" },
      { id: "progress_tracking", label: "Progress Tracking" },
    ],
  },
];

// ── Gaming ─────────────────────────────────────────────────────────────

const GAMING_TAGS: TagCategory[] = [
  {
    id: "gaming-gameplay",
    label: "Gameplay",
    tags: [
      { id: "mechanics", label: "Mechanics" },
      { id: "strategy", label: "Strategy" },
      { id: "meta", label: "Meta" },
    ],
  },
  {
    id: "gaming-competition",
    label: "Competition",
    tags: [
      { id: "ranked_play", label: "Ranked Play" },
      { id: "esports", label: "Esports" },
    ],
  },
  {
    id: "gaming-content",
    label: "Content",
    tags: [
      { id: "streaming", label: "Streaming" },
      { id: "community", label: "Community" },
    ],
  },
  {
    id: "gaming-equipment",
    label: "Equipment",
    tags: [
      { id: "hardware", label: "Hardware" },
      { id: "setup", label: "Setup" },
    ],
  },
  {
    id: "gaming-narrative",
    label: "Narrative",
    tags: [
      { id: "lore", label: "Lore" },
      { id: "story", label: "Story" },
    ],
  },
  {
    id: "gaming-analytics",
    label: "Analytics",
    tags: [
      { id: "match_data", label: "Match Data" },
      { id: "performance_metrics", label: "Performance Metrics" },
    ],
  },
];

// ── Master lookup ──────────────────────────────────────────────────────

const DOMAIN_TAGS: Record<string, TagCategory[]> = {
  sports: SPORTS_TAGS,
  music: MUSIC_TAGS,
  "film-tv": FILM_TV_TAGS,
  fashion: FASHION_TAGS,
  education: EDUCATION_TAGS,
  business: BUSINESS_TAGS,
  finance: FINANCE_TAGS,
  technology: TECHNOLOGY_TAGS,
  "health-fitness": HEALTH_FITNESS_TAGS,
  gaming: GAMING_TAGS,
};

/** Fallback tags used when a domain has no explicit taxonomy. */
const FALLBACK_TAGS: TagCategory[] = [
  {
    id: "general-observation",
    label: "General",
    tags: [
      { id: "insight", label: "Insight" },
      { id: "trend", label: "Trend" },
      { id: "analysis", label: "Analysis" },
      { id: "signal", label: "Signal" },
    ],
  },
];

/**
 * Get observation tag categories for a given intelligence domain.
 * Returns the Sports taxonomy (default) when domain is empty or unknown.
 */
export function getObservationTags(domainId: string): TagCategory[] {
  return DOMAIN_TAGS[domainId] ?? SPORTS_TAGS;
}

/**
 * Get a flat array of all tag IDs for a given domain.
 */
export function getAllTagsFlat(domainId: string): { id: string; label: string }[] {
  const cats = getObservationTags(domainId);
  return cats.flatMap((cat) => cat.tags);
}

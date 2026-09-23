export interface DirectoryLocation {
  id: string;
  name: string;
  aliases: string[];
  operator: string | null;
  country: string;
  subdivision: string | null;
  city: string;
  address: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinate_quality: string | null;
  coordinate_source: string | null;
  operating_status: string;
  game_availability: string;
  publication_status: string;
  published_at: string | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectoryGame {
  id: string;
  location_id: string;
  game_type: string;
  table_count: number | null;
  decks: number | null;
  decks_cut: number | null;
  min_bet: number | null;
  max_bet: number | null;
  currency: string | null;
  payout: string | null;
  soft_17: string | null;
  double_rules: string | null;
  double_after_split: boolean | null;
  max_split_hands: number | null;
  resplit_aces: boolean | null;
  surrender: string | null;
  dealer_procedure: string | null;
  dealer_blackjack_wager_treatment: string | null;
  mid_shoe_entry: string | null;
  dealing_method: string | null;
  shuffle_method: string | null;
  reported_house_edge_pct: number | null;
  availability: string;
  publication_status: string;
  reported_month: string | null;
  verified_at: string | null;
  extra_rules: Record<string, unknown> | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectoryNote {
  id: string;
  location_id: string;
  game_id: string | null;
  category: string;
  body: string;
  audience: string;
  reported_month: string | null;
  created_at: string;
}

export interface DirectorySearchLocation extends Pick<DirectoryLocation, "id" | "name" | "aliases" | "operator" | "country" | "subdivision" | "city" | "address" | "website" | "latitude" | "longitude" | "coordinate_quality" | "coordinate_source" | "operating_status" | "game_availability" | "updated_at"> {
  game_count: number;
  earliest_min_bet?: number | null;
  latest_reported_month?: string | null;
  distance_km?: number | null;
}

export interface DirectoryFilters {
  q?: string;
  game_type?: string;
  decks?: number;
  min_bet_max?: number;
  currency?: string;
  soft_17?: string;
  payout?: string;
  double_after_split?: boolean;
  surrender?: string;
  min_penetration?: number;
  mid_shoe_entry?: string;
  reported_since?: string;
  latitude?: number;
  longitude?: number;
}

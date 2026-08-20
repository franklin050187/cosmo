export type GameMode = "pvp" | "tournament" | "campaign";
export type GameVisibility = "public" | "private";
export type GameStatus = "open" | "closed" | "finished";
export type BracketType = "single_elim" | "double_elim";
export type BracketName = "winners" | "losers" | "grand_final";

export interface GameSummary {
  id: number;
  owner_name: string;
  title: string;
  description: string;
  game_mode: GameMode;
  visibility: GameVisibility;
  invite_code: string;
  collection_id: number | null;
  status: GameStatus;
  game_date: string;
  register_open_at: string | null;
  register_close_at: string | null;
  roulette_enabled: boolean;
  created_at: string;
  participant_count: number;
  ship_count: number;
  bracket_type: BracketType;
  /** Whether the current viewer is registered (annotated by the games API). */
  registered?: boolean;
}

export interface GameParticipant {
  discord_id: string | null;
  discord_username: string;
  registered_at: string;
}

export interface GameContestant {
  id: number;
  discord_id: string | null;
  discord_username: string;
  seed: number;
  losses: number;
}

export interface GameMatch {
  id: number;
  bracket: BracketName;
  round: number;
  position: number;
  contestant_a: number | null;
  contestant_b: number | null;
  winner: number | null;
  a_username: string | null;
  b_username: string | null;
  winner_username: string | null;
}

export interface GameShipDraw {
  participant_username: string;
  participant_discord_id: string | null;
  ship_id: number;
  ship_name: string;
  data: string;
  downloads: number;
  fav: number;
}

export interface GameDetail extends GameSummary {
  owner_discord_id: string;
  collection: { id: number; title: string } | null;
  ships: Array<{ id: number; ship_name: string; data: string; downloads: number; fav: number }>;
  participants: GameParticipant[];
  contestants: GameContestant[];
  matches: GameMatch[];
  draws: GameShipDraw[];
}
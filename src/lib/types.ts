import { type ShipRow } from "./db";

export interface ShipDetail {
  id: number;
  ship_name: string;
  data: string;
  author: string;
  description: string;
  price: number;
  crew: number;
  tags: string[];
  submitted_by: string;
  brand: string;
  downloads: number;
  fav: number;
  date: string;
}

export interface PriceResponse {
  price: number;
  crew: number;
  author: string;
  tags: string[];
}

export interface CollectionSummary {
  id: number;
  owner: string;
  title: string;
  description: string;
  ship_count: number | null;
  created_at: string;
}

export interface CollectionDetail {
  id: number;
  owner: string;
  title: string;
  description: string;
  ships: ShipRow[];
  created_at: string;
}

export type GameMode = "pvp" | "tournament" | "campaign";
export type GameVisibility = "public" | "private";
export type GameStatus = "open" | "closed" | "finished";

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
}

export interface GameMatch {
  id: number;
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
  ship_id: number;
  ship_name: string;
}

export interface GameDetail extends GameSummary {
  owner_discord_id: string;
  collection: { id: number; title: string } | null;
  ships: Array<{ id: number; ship_name: string; data: string }>;
  participants: GameParticipant[];
  contestants: GameContestant[];
  matches: GameMatch[];
  draws: GameShipDraw[];
}

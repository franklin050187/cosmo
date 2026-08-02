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

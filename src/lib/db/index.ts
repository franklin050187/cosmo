// Core database utilities
export {
  getPool,
  query,
  queryOnClient,
  fetchAll,
  fetchOne,
  fetchAllOnClient,
  fetchOneOnClient,
  transaction,
  sanitizeText,
  PAGE_SIZE,
} from "./core";

// Ship-related queries and types
export type { ShipRow } from "./ships";
export {
  getImageData,
  getMyShips,
  updateDownloads,
  deleteShip,
  insertShip,
  updateShip,
} from "./ships";

// Collection queries and types
export type { CollectionRow } from "./collections";
export {
  createCollection,
  getCollection,
  getUserCollections,
  getAllCollections,
  updateCollection,
  deleteCollection,
  addShipToCollection,
  removeShipFromCollection,
  getCollectionsForShip,
} from "./collections";

// Favorites queries
export {
  getMyFavorites,
  addToFavorites,
  deleteFromFavorites,
} from "./favorites";

// User ownership, migration, signatures
export {
  isShipOwner,
  isCollectionOwner,
  migrateUsernameOnLogin,
} from "./users";

// Search queries and types
export type { SearchFilters } from "./search";
export {
  getSearchPlus,
  searchFromQueryString,
  getAuthorsWithCounts,
  getTagsWithCounts,
  findDuplicateBySignature,
} from "./search";

// Analytics queries and types
export type { DashboardData } from "./analytics";
export {
  logEvent,
  getDashboardData,
} from "./analytics";
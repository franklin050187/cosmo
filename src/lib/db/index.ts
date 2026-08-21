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
  getShipForReplacement,
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
  isShipFavorited,
  addToFavorites,
  deleteFromFavorites,
} from "./favorites";

// Games queries
export type { GameRow, GameSummaryRow, GameMode, GameVisibility, GameStatus } from "./games";
export {
  isGameOwner,
  snapshotCollectionShips,
  createGame,
  listGames,
  listUpcomingGames,
  listPastGames,
  listMyGames,
  listRegisteredGameIds,
  getGame,
  getGameByInviteCode,
  updateGame,
  markGameFinished,
  deleteGame,
  registerForGame,
  leaveGame,
  resolveUsernameToDiscordId,
  stripGameForViewer,
  addContestant,
  removeContestant,
  generateBracket,
  setMatchWinner,
  resetMatchWinner,
  dealShips,
} from "./games";

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
export const defaultHomeFavorites: readonly string[];
export function toggleHomeFeatureFavorite(favorites: readonly string[], id: string): string[];
export function sidebarHomeFeatures<T extends { tool: string }>(cards: T[], favorites: readonly string[]): T[];

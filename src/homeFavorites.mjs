export const defaultHomeFavorites = Object.freeze(['calendar', 'rename', 'count', 'translation', 'signature', 'copies', 'word', 'settings']);

export const toggleHomeFeatureFavorite = (favorites, id) => favorites.includes(id) ? favorites.filter(favorite => favorite !== id) : [...favorites, id];

export const sidebarHomeFeatures = (cards, favorites) => cards.filter(card => card.tool === 'settings' || favorites.includes(card.tool));

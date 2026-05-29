export let currentUser = null;
export let userSettings = { categories: [], paymentMethods: [] };

export function setCurrentUser(user) { currentUser = user; }
export function setUserSettings(s) { userSettings = s; }

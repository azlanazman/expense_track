export let currentUser = null;
export let userSettings = { categories: [], paymentMethods: [], salaryDay: 25 };

export function setCurrentUser(user) { currentUser = user; }
export function setUserSettings(s) { userSettings = s; }

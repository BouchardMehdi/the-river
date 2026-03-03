export const State = {
  token: localStorage.getItem("token") || null,
  user: JSON.parse(localStorage.getItem("user") || "null"),
  currentTableId: localStorage.getItem("currentTableId") || null,
};

export function setAuth(token, user) {
  State.token = token;
  State.user = user || null;
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user || null));
}

export function clearAuth() {
  State.token = null;
  State.user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function setCurrentTableId(tableId) {
  State.currentTableId = tableId || null;
  if (tableId) localStorage.setItem("currentTableId", tableId);
  else localStorage.removeItem("currentTableId");
}

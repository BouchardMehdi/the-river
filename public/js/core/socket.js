import { State } from "./state.js";

let socket = null;
let listeners = new Set();

export function getSocket() { return socket; }

export function connectPokerSocket({ onSystem, onChat, onError, onJoined }) {
  if (socket) return socket;

  if (typeof window.io !== "function") {
    throw new Error("socket.io client not loaded (io is undefined). Check script order in HTML.");
  }

  socket = window.io("/poker", {
    auth: { token: State.token },
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    timeout: 10000,
  });

  socket.on("connect", () => {
    listeners.forEach((fn) => fn({ type: "connect", id: socket.id }));
  });

  socket.on("disconnect", (reason) => {
    listeners.forEach((fn) => fn({ type: "disconnect", reason }));
  });

  socket.on("connect_error", (e) => onError?.(e?.message || String(e)));

  socket.on("chatSystem", (m) => onSystem?.(m));
  socket.on("chatMessage", (m) => onChat?.(m));
  socket.on("chatError", (e) => onError?.(JSON.stringify(e)));
  socket.on("joinedChat", (m) => onJoined?.(m));

  return socket;
}

export function onSocketEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function joinChat(tableId) {
  if (!socket || !socket.connected) return false;
  socket.emit("joinTableChat", { tableId });
  return true;
}

export function sendChat(tableId, message) {
  if (!socket || !socket.connected) return false;
  socket.emit("sendMessage", { tableId, message });
  return true;
}

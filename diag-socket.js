const { io } = require("socket.io-client");

// colle ton JWT ici (le même que tu utilises dans ton HTML)
const token = "TON_JWT_ICI";

const socket = io("http://127.0.0.1:3000/poker", {
  auth: { token },           // ✅ envoie le JWT comme ton HTML
  transports: ["polling"],   // stable
  reconnection: true,
  reconnectionAttempts: Infinity,
});

socket.on("connect", () => console.log("✅ connect", socket.id));
socket.on("disconnect", (r) => console.log("❌ disconnect", r));
socket.on("connect_error", (e) => console.log("connect_error:", e.message));

setInterval(() => {
  socket.emit("joinTableChat", { tableId: "ABCDEF" });
}, 3000);

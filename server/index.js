const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
  },
  pingInterval: 25000,
  pingTimeout: 10000,
});

// Track connected users by entry ID
// Shape: { [entryId]: [{ id: socketId, username, clientId }] }
const entryRooms = {};

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join", ({ entryId, username, clientId }) => {
    if (typeof entryId !== "string" || !entryId) return;
    if (typeof username !== "string") return;
    if (typeof clientId !== "string") return;

    socket.join(entryId);

    if (!entryRooms[entryId]) {
      entryRooms[entryId] = [];
    }

    // Prevent duplicate entries for the same client (e.g. on reconnect)
    entryRooms[entryId] = entryRooms[entryId].filter(
      (user) => user.clientId !== clientId
    );

    entryRooms[entryId].push({ id: socket.id, username, clientId, editingField: null });

    io.to(entryId).emit(
      "updateUsers",
      entryRooms[entryId].map((u) => ({
        username: u.username,
        clientId: u.clientId,
        editingField: u.editingField,
      }))
    );

    console.log(`${username} (${clientId}) joined entry ${entryId}`);
  });

  socket.on("fieldFocus", ({ entryId, fieldUid }) => {
    const room = entryRooms[entryId];
    if (!room) return;
    const user = room.find((u) => u.id === socket.id);
    if (user) user.editingField = fieldUid;
    io.to(entryId).emit(
      "updateUsers",
      room.map((u) => ({
        username: u.username,
        clientId: u.clientId,
        editingField: u.editingField,
      }))
    );
  });

  socket.on("entryUpdated", ({ entryId, changes }) => {
    if (typeof entryId !== "string" || !entryId) return;
    if (!changes || typeof changes !== "object" || Array.isArray(changes))
      return;

    // Look up the sender's username
    const room = entryRooms[entryId];
    const sender = room?.find((u) => u.id === socket.id);
    const username = sender?.username || "Unknown";

    socket.to(entryId).emit("entryUpdated", { changes, username });
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);

    for (const entryId in entryRooms) {
      const before = entryRooms[entryId].length;
      entryRooms[entryId] = entryRooms[entryId].filter(
        (user) => user.id !== socket.id
      );

      // Only emit if the user was actually in this room
      if (entryRooms[entryId].length < before) {
        io.to(entryId).emit(
          "updateUsers",
          entryRooms[entryId].map((u) => ({
            username: u.username,
            clientId: u.clientId,
            editingField: u.editingField,
          }))
        );
      }

      if (entryRooms[entryId].length === 0) {
        delete entryRooms[entryId];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});

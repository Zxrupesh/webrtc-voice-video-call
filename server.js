// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join', (roomId) => {
    socket.join(roomId);

    // Build list of other socket ids in the room
    const clients = io.sockets.adapter.rooms.get(roomId);
    const otherIds = [];
    if (clients) {
      for (const id of clients) {
        if (id !== socket.id) otherIds.push(id);
      }
    }

    console.log(`${socket.id} joined ${roomId} (clients: ${clients ? clients.size : 0})`);

    // Tell the joining client who is already in the room
    socket.emit('joined', { roomId, otherIds });

    // Tell others that a new user joined
    socket.to(roomId).emit('user-joined', { socketId: socket.id });
  });

  // Forwarding signaling messages to a specific socket id
  socket.on('offer', ({ to, desc, from }) => {
    if (!to) return;
    io.to(to).emit('offer', { desc, from });
  });

  socket.on('answer', ({ to, desc, from }) => {
    if (!to) return;
    io.to(to).emit('answer', { desc, from });
  });

  socket.on('ice-candidate', ({ to, candidate, from }) => {
    if (!to) return;
    io.to(to).emit('ice-candidate', { candidate, from });
  });

  socket.on('leave', (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit('user-left', { socketId: socket.id });
  });

  socket.on('disconnect', () => {
    // Broadcast disconnect to all rooms the socket was in
    const rooms = socket.rooms;
    for (const roomId of rooms) {
      if (roomId === socket.id) continue;
      socket.to(roomId).emit('user-left', { socketId: socket.id });
    }
    console.log('socket disconnected', socket.id);
  });
});

http.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));

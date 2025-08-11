// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join', (roomId) => {
    socket.join(roomId);
    const clients = io.sockets.adapter.rooms.get(roomId);
    const numClients = clients ? clients.size : 0;
    console.log(`${socket.id} joined ${roomId} (clients: ${numClients})`);
    // Tell the joining client how many are in the room
    socket.emit('joined', { roomId, numClients });
    // Tell others in the room someone joined
    socket.to(roomId).emit('peer-joined', { socketId: socket.id, numClients });
  });

  socket.on('offer', ({ roomId, desc }) => {
    socket.to(roomId).emit('offer', { desc, from: socket.id });
  });

  socket.on('answer', ({ roomId, desc }) => {
    socket.to(roomId).emit('answer', { desc, from: socket.id });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('leave', (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit('peer-left', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

http.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));

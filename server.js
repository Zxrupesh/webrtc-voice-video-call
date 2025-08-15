// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // Join room
  socket.on('join', (roomId) => {
    socket.join(roomId);
    const clients = io.sockets.adapter.rooms.get(roomId);
    const numClients = clients ? clients.size : 0;
    console.log(`${socket.id} joined ${roomId} (clients: ${numClients})`);
    
    // Notify joining client
    socket.emit('joined', { roomId, numClients });
    
    // Notify other clients in the room
    socket.to(roomId).emit('peer-joined', { socketId: socket.id });
  });

  // Forward offer to specific peer
  socket.on('offer', ({ roomId, desc, to }) => {
    io.to(to).emit('offer', { desc, from: socket.id });
  });

  // Forward answer to specific peer
  socket.on('answer', ({ roomId, desc, to }) => {
    io.to(to).emit('answer', { desc, from: socket.id });
  });

  // Forward ICE candidate to specific peer
  socket.on('ice-candidate', ({ roomId, candidate, to }) => {
    io.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });

  // Leave room
  socket.on('leave', (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit('peer-left', socket.id);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    // Inform all rooms the socket was in
    socket.rooms.forEach((roomId) => {
      socket.to(roomId).emit('peer-left', socket.id);
    });
  });
});

http.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));

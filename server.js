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
    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const numClients = clients.length;

    console.log(`${socket.id} joined ${roomId} (clients: ${numClients})`);

    // Send to the joining client: your ID + all other client IDs in room
    socket.emit('joined', { roomId, numClients, yourId: socket.id, others: clients.filter(id => id !== socket.id) });

    // Notify existing clients that a new peer joined
    socket.to(roomId).emit('peer-joined', { socketId: socket.id });
  });

  socket.on('offer', ({ desc, to }) => {
    io.to(to).emit('offer', { desc, from: socket.id });
  });

  socket.on('answer', ({ desc, to }) => {
    io.to(to).emit('answer', { desc, from: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    io.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('leave', (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit('peer-left', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    // Notify all rooms this socket was in
    socket.rooms.forEach(roomId => {
      socket.to(roomId).emit('peer-left', socket.id);
    });
  });
});

http.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

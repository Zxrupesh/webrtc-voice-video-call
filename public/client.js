// public/client.js
const socket = io();

// Join a room (for now, just hardcode a test room)
const roomId = "test-room";
socket.emit("join", roomId);

// When someone joins
socket.on("peer-joined", ({ socketId, numClients }) => {
    console.log(`Peer joined: ${socketId}, total clients: ${numClients}`);
});

// Handle offers
socket.on("offer", ({ desc, from }) => {
    console.log(`Received offer from ${from}`, desc);
});

// Handle answers
socket.on("answer", ({ desc, from }) => {
    console.log(`Received answer from ${from}`, desc);
});

// Handle ICE candidates
socket.on("ice-candidate", ({ candidate, from }) => {
    console.log(`Received ICE candidate from ${from}`, candidate);
});

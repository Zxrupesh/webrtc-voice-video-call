// client.js
const socket = io();
let localStream;
let peerConnections = {}; // Track multiple peers
let currentRoomId = null;

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:numb.viagenie.ca",
      username: "webrtc@live.com",
      credential: "muazkh"
    }
  ]
};

const roomInput = document.getElementById("roomId");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

joinBtn.onclick = async () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter a room ID");
  currentRoomId = roomId;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20 } },
    audio: true
  });
  localVideo.srcObject = localStream;

  socket.emit("join", roomId);
};

leaveBtn.onclick = () => {
  socket.emit("leave", currentRoomId);
  for (let id in peerConnections) {
    peerConnections[id].close();
  }
  peerConnections = {};
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
};

// When you join the room
socket.on("joined", async ({ roomId, numClients }) => {
  console.log("Joined room", roomId, "Clients:", numClients);
});

// When a new peer joins
socket.on("peer-joined", async ({ socketId }) => {
  console.log("Peer joined:", socketId);
  createPeerConnection(socketId, true);
});

// Receive offer
socket.on("offer", async ({ from, desc }) => {
  if (!peerConnections[from]) {
    createPeerConnection(from, false);
  }
  await peerConnections[from].setRemoteDescription(new RTCSessionDescription(desc));
  const answer = await peerConnections[from].createAnswer();
  await peerConnections[from].setLocalDescription(answer);
  socket.emit("answer", { roomId: currentRoomId, desc: answer, to: from });
});

// Receive answer
socket.on("answer", async ({ from, desc }) => {
  if (peerConnections[from]) {
    await peerConnections[from].setRemoteDescription(new RTCSessionDescription(desc));
  }
});

// Receive ICE candidates
socket.on("ice-candidate", ({ from, candidate }) => {
  if (peerConnections[from] && candidate) {
    peerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
  }
});

socket.on("peer-left", (socketId) => {
  console.log("Peer left:", socketId);
  if (peerConnections[socketId]) {
    peerConnections[socketId].close();
    delete peerConnections[socketId];
  }
});

function createPeerConnection(peerId, isOfferer) {
  const pc = new RTCPeerConnection(config);
  peerConnections[peerId] = pc;

  // Add local tracks
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // Remote track
  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { roomId: currentRoomId, candidate: event.candidate, to: peerId });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`ICE state with ${peerId}:`, pc.iceConnectionState);
  };

  if (isOfferer) {
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { roomId: currentRoomId, desc: offer, to: peerId });
    };
  }
}

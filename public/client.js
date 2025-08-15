const socket = io();

let localStream;
let peerConnection;
let currentRoomId = null;
let remoteSocketId = null;

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

// Join a room
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

// Leave a room
leaveBtn.onclick = () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  if (currentRoomId && remoteSocketId) {
    socket.emit("leave", currentRoomId);
    remoteSocketId = null;
    currentRoomId = null;
  }
};

// Socket events
socket.on("joined", async ({ roomId, numClients, yourId }) => {
  console.log("joined", roomId, numClients);

  if (numClients > 1) {
    // You are the second user
    startPeerConnection();
    // Get remote peer id
    const clients = Array.from(socket.adapter?.rooms?.get(roomId) || []);
    remoteSocketId = clients.find(id => id !== yourId);
    await createAndSendOffer();
  }
});

socket.on("peer-joined", ({ socketId }) => {
  remoteSocketId = socketId;
  startPeerConnection();
});

// Offer/Answer
socket.on("offer", async ({ desc, from }) => {
  if (!peerConnection) startPeerConnection();
  remoteSocketId = from;

  await peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
  const answer = await peerConnection.createAnswer();
  // Limit video bitrate
  answer.sdp = answer.sdp.replace(/a=mid:video\r\n/g, "a=mid:video\r\nb=AS:1500\r\n");
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId: currentRoomId, desc: answer, to: from });
});

socket.on("answer", async ({ desc }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
});

// ICE candidates
socket.on("ice-candidate", ({ candidate }) => {
  if (candidate && peerConnection) {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

// Create PeerConnection
function startPeerConnection() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && remoteSocketId) {
      socket.emit("ice-candidate", { roomId: currentRoomId, candidate: event.candidate, to: remoteSocketId });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE connection state:", peerConnection.iceConnectionState);
  };
}

// Create and send offer
async function createAndSendOffer() {
  const offer = await peerConnection.createOffer();
  offer.sdp = offer.sdp.replace(/a=mid:video\r\n/g, "a=mid:video\r\nb=AS:1500\r\n");
  await peerConnection.setLocalDescription(offer);

  if (remoteSocketId) {
    socket.emit("offer", { roomId: currentRoomId, desc: offer, to: remoteSocketId });
  }
}

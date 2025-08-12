// client.js
const socket = io();
let localStream;
let peerConnection;
let currentRoomId = null;

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

joinBtn.onclick = async () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter a room ID");
  currentRoomId = roomId;

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  socket.emit("join", roomId);
};

socket.on("joined", async ({ roomId, numClients }) => {
  if (numClients > 1) {
    // YOU are the second user, create the offer
    startPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", { roomId: currentRoomId, desc: offer });
  }
});

socket.on("peer-joined", () => {
  // First user just waits for an offer
  startPeerConnection();
});

socket.on("offer", async ({ desc }) => {
  if (!peerConnection) startPeerConnection();

  await peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId: currentRoomId, desc: answer });
});

socket.on("answer", async ({ desc }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
});

socket.on("ice-candidate", ({ candidate }) => {
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

function startPeerConnection() {
  if (peerConnection) return; // Prevent duplicates
  peerConnection = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { roomId: currentRoomId, candidate: event.candidate });
    }
  };
}

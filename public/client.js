// client.js
const socket = io();
let localStream;
let peerConnection;
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

// Join button
joinBtn.onclick = async () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter a room ID");
  currentRoomId = roomId;

  // Get user media with optimized resolution & framerate
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20 } },
    audio: true
  });
  localVideo.srcObject = localStream;

  socket.emit("join", roomId);
};

// Leave button
leaveBtn.onclick = () => {
  socket.emit("leave", currentRoomId);
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
};

// Socket events
socket.on("joined", async ({ roomId, numClients }) => {
  if (numClients > 1) {
    startPeerConnection();

    // Create offer if you are the second user
    const offer = await peerConnection.createOffer();
    // Limit video bitrate to 1500 kbps
    offer.sdp = offer.sdp.replace(/a=mid:video\r\n/g, "a=mid:video\r\nb=AS:1500\r\n");
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", { roomId: currentRoomId, desc: offer });
  }
});

socket.on("peer-joined", () => {
  startPeerConnection();
});

socket.on("offer", async ({ desc }) => {
  if (!peerConnection) startPeerConnection();

  await peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
  const answer = await peerConnection.createAnswer();
  answer.sdp = answer.sdp.replace(/a=mid:video\r\n/g, "a=mid:video\r\nb=AS:1500\r\n");
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId: currentRoomId, desc: answer });
});

socket.on("answer", async ({ desc }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
});

socket.on("ice-candidate", ({ candidate }) => {
  if (candidate && peerConnection) {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

// Create PeerConnection
function startPeerConnection() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection(config);

  // Add local tracks
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Remote track
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { roomId: currentRoomId, candidate: event.candidate });
    }
  };

  // ICE connection state logging
  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE connection state:", peerConnection.iceConnectionState);
  };
}

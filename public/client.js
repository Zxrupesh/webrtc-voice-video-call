const socket = io();

let localStream;
let peerConnection;
const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const roomInput = document.getElementById("roomId");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

joinBtn.onclick = async () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter a room ID");

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  socket.emit("join", roomId);
};

socket.on("joined", async ({ roomId, numClients }) => {
  if (numClients > 1) {
    startPeerConnection();
  }
});

socket.on("peer-joined", () => {
  startPeerConnection();
});

socket.on("offer", async ({ desc, from }) => {
  if (!peerConnection) startPeerConnection();

  await peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId: roomInput.value, desc: answer });
});

socket.on("answer", async ({ desc }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
});

socket.on("ice-candidate", ({ candidate }) => {
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

leaveBtn.onclick = () => {
  socket.emit("leave", roomInput.value);
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
};

function startPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { roomId: roomInput.value, candidate: event.candidate });
    }
  };

  peerConnection.onnegotiationneeded = async () => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", { roomId: roomInput.value, desc: offer });
  };
}

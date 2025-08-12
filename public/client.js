// public/client.js
const socket = io();

let localStream = null;
const peerConnections = {}; // map remoteSocketId -> RTCPeerConnection
const pendingIce = {};      // map remoteSocketId -> array of ICE candidates received before PC exists
let currentRoomId = null;

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
    // Add TURN here when you have credentials
  ],
};

// UI elements
const roomInput = document.getElementById("roomId");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const localVideo = document.getElementById("localVideo");
const videosContainer = document.querySelector('#videos') || document.body; // where to append remote videos

// helper: create remote video element
function createRemoteVideoEl(id) {
  let el = document.getElementById(`remote-${id}`);
  if (el) return el;
  el = document.createElement('video');
  el.id = `remote-${id}`;
  el.autoplay = true;
  el.playsInline = true;
  el.className = 'remote-video';
  el.style.maxWidth = '45vw';
  el.style.borderRadius = '10px';
  videosContainer.appendChild(el);
  return el;
}

function removeRemoteVideoEl(id) {
  const el = document.getElementById(`remote-${id}`);
  if (el) el.remove();
}

// start local media
async function startLocalStream() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  return localStream;
}

joinBtn.onclick = async () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter a room ID");
  currentRoomId = roomId;

  try {
    await startLocalStream();
  } catch (err) {
    console.error('getUserMedia error', err);
    return alert('Camera/microphone access required.');
  }

  socket.emit('join', roomId);
  joinBtn.disabled = true;
  leaveBtn.disabled = false;
};

leaveBtn.onclick = () => {
  if (!currentRoomId) return;
  socket.emit('leave', currentRoomId);
  cleanupAll();
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  currentRoomId = null;
  roomInput.value = '';
};

// when we join, server returns other client ids already in the room
socket.on('joined', async ({ roomId, otherIds }) => {
  console.log('joined', roomId, otherIds);
  // For every existing peer, create a PC and make an offer to them (joining client initiates)
  for (const id of otherIds) {
    await startPeerConnectionWith(id, true); // create and offer
  }
});

// when someone else joins after you
socket.on('user-joined', async ({ socketId }) => {
  console.log('user-joined', socketId);
  // we do nothing special here; if we are already in room, the joining user will create offers to us
  // but we ensure we have a PC ready to receive offers (create blank PC)
  if (!peerConnections[socketId]) {
    await startPeerConnectionWith(socketId, false); // create PC but don't create offer
  }
});

// incoming offer: create PC if needed, set remote, create answer
socket.on('offer', async ({ desc, from }) => {
  console.log('offer from', from);
  if (!peerConnections[from]) {
    await startPeerConnectionWith(from, false);
  }
  const pc = peerConnections[from];
  await pc.setRemoteDescription(new RTCSessionDescription(desc));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { to: from, desc: pc.localDescription, from: socket.id });
});

// incoming answer: set remote
socket.on('answer', async ({ desc, from }) => {
  console.log('answer from', from);
  const pc = peerConnections[from];
  if (!pc) {
    console.warn('No pc for answer from', from);
    return;
  }
  await pc.setRemoteDescription(new RTCSessionDescription(desc));
});

// incoming ICE candidate: add to pc or buffer until pc exists
socket.on('ice-candidate', async ({ candidate, from }) => {
  if (!candidate) return;
  if (peerConnections[from]) {
    try {
      await peerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('Error adding received candidate', e);
    }
  } else {
    // buffer
    pendingIce[from] = pendingIce[from] || [];
    pendingIce[from].push(candidate);
  }
});

// when a user leaves or disconnects
socket.on('user-left', ({ socketId }) => {
  console.log('user-left', socketId);
  if (peerConnections[socketId]) {
    try { peerConnections[socketId].close(); } catch(e){}
    delete peerConnections[socketId];
  }
  if (pendingIce[socketId]) delete pendingIce[socketId];
  removeRemoteVideoEl(socketId);
});

// create/start a peer connection with a remote socket id
async function startPeerConnectionWith(remoteId, createOfferImmediately = false) {
  if (!localStream) {
    await startLocalStream();
  }
  if (peerConnections[remoteId]) return peerConnections[remoteId];

  const pc = new RTCPeerConnection(config);
  peerConnections[remoteId] = pc;

  // add local tracks
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // remote track handler
  pc.ontrack = (event) => {
    // create or reuse remote video element
    const videoEl = createRemoteVideoEl(remoteId);
    videoEl.srcObject = event.streams[0];
  };

  // ICE candidate -> send to target
  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit('ice-candidate', { to: remoteId, candidate: ev.candidate, from: socket.id });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`PC state with ${remoteId}:`, pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      // cleanup
      try { pc.close(); } catch(e){}
      delete peerConnections[remoteId];
      removeRemoteVideoEl(remoteId);
    }
  };

  // If there were buffered ICE candidates from remote, add them now
  if (pendingIce[remoteId] && pendingIce[remoteId].length) {
    for (const c of pendingIce[remoteId]) {
      try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e){}
    }
    delete pendingIce[remoteId];
  }

  // Optionally create offer immediately (used by joining client)
  if (createOfferImmediately) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { to: remoteId, desc: pc.localDescription, from: socket.id });
  }

  return pc;
}

function cleanupAll() {
  for (const id in peerConnections) {
    try { peerConnections[id].close(); } catch(e){}
    removeRemoteVideoEl(id);
  }
  Object.keys(peerConnections).forEach(k => delete peerConnections[k]);
  Object.keys(pendingIce).forEach(k => delete pendingIce[k]);

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    localVideo.srcObject = null;
  }
}

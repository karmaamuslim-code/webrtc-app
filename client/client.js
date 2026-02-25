/**
 * client.js — WebRTC Multimedia Application
 * Handles: signaling (WebSocket), peer connection, media streams, and DataChannel chat.
 */

// ── State ─────────────────────────────────────────────────────────────────────
let localStream = null;
let peerConnection = null;
let dataChannel = null;
let ws = null;
let isMuted = false;
let isCameraOff = false;

// ICE / STUN configuration
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// ── UI Helpers ─────────────────────────────────────────────────────────────────

function setStatus(state, label) {
  const badge = document.getElementById('statusBadge');
  badge.className = `status-badge ${state}`;
  badge.textContent = `● ${label}`;
}

function setControlsEnabled(connected) {
  document.getElementById('connectBtn').disabled = connected;
  document.getElementById('disconnectBtn').disabled = !connected;
  document.getElementById('muteBtn').disabled = !connected;
  document.getElementById('cameraBtn').disabled = !connected;
  document.getElementById('messageInput').disabled = !connected;
  document.getElementById('sendBtn').disabled = !connected;
}

function addMessage(text, type = 'system') {
  const chatBox = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showRemoteOverlay(visible, text = '') {
  const overlay = document.getElementById('remoteOverlay');
  overlay.textContent = text;
  overlay.classList.toggle('visible', visible);
}

function showLocalOverlay(visible) {
  const overlay = document.getElementById('localOverlay');
  overlay.classList.toggle('visible', visible);
}

// ── WebSocket Signaling ────────────────────────────────────────────────────────

function connectSignaling() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      console.log('Connected to signaling server.');
      resolve();
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      reject(err);
    };

    ws.onmessage = async (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'connected') {
        console.log(`Signaling: ${data.clientCount} client(s) connected.`);
        return;
      }

      if (data.type === 'peer-disconnected') {
        addMessage('Peer has disconnected.', 'system');
        showRemoteOverlay(true, 'Peer disconnected');
        return;
      }

      if (data.offer) {
        console.log('Received offer, handling...');
        await handleOffer(data.offer);
      }

      if (data.answer) {
        console.log('Received answer.');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      }

      if (data.candidate) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.warn('Failed to add ICE candidate:', e);
        }
      }
    };

    ws.onclose = () => {
      console.log('Signaling connection closed.');
    };
  });
}

// ── Peer Connection Setup ──────────────────────────────────────────────────────

function createPeerConnection() {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  // Send ICE candidates to signaling server
  pc.onicecandidate = (event) => {
    if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ candidate: event.candidate }));
    }
  };

  // When remote track arrives, attach to remote video
  pc.ontrack = (event) => {
    console.log('Remote track received.');
    document.getElementById('remoteVideo').srcObject = event.streams[0];
    showRemoteOverlay(false);
    setStatus('connected', 'Connected');
    setControlsEnabled(true);
    addMessage('Peer connected! You can now chat.', 'system');
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      addMessage('Connection lost.', 'system');
      showRemoteOverlay(true, 'Connection lost');
    }
  };

  return pc;
}

// ── Media ──────────────────────────────────────────────────────────────────────

async function getLocalMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
    showLocalOverlay(false);
    return localStream;
  } catch (err) {
    addMessage('Could not access camera/mic: ' + err.message, 'system');
    throw err;
  }
}

// ── Data Channel ───────────────────────────────────────────────────────────────

function setupDataChannel(channel) {
  channel.onopen = () => {
    console.log('DataChannel open.');
  };
  channel.onclose = () => {
    console.log('DataChannel closed.');
  };
  channel.onmessage = (event) => {
    addMessage(event.data, 'peer');
  };
  channel.onerror = (err) => {
    console.error('DataChannel error:', err);
  };
}

// ── Main Connection Flow ───────────────────────────────────────────────────────

/**
 * Called by the first user who clicks "Connect".
 * Creates the offer and sends it via signaling.
 */
async function startConnection() {
  setStatus('connecting', 'Connecting...');
  addMessage('Connecting to signaling server...', 'system');

  try {
    await connectSignaling();
  } catch {
    setStatus('disconnected', 'Disconnected');
    addMessage('Could not reach signaling server. Is it running?', 'system');
    return;
  }

  await getLocalMedia();

  peerConnection = createPeerConnection();

  // Add local tracks to peer connection
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Create DataChannel (offerer side)
  dataChannel = peerConnection.createDataChannel('chat');
  setupDataChannel(dataChannel);

  // Create and send offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  ws.send(JSON.stringify({ offer }));

  addMessage('Offer sent. Waiting for peer to connect...', 'system');
  showRemoteOverlay(true, 'Waiting for peer...');
}

/**
 * Called on the answering peer when an offer is received.
 */
async function handleOffer(offer) {
  peerConnection = createPeerConnection();

  // Listen for DataChannel from offerer
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel(dataChannel);
  };

  // Add local tracks
  if (!localStream) {
    await getLocalMedia();
  }
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Set remote description (the offer)
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  // Create and send answer
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  ws.send(JSON.stringify({ answer }));

  addMessage('Answer sent. Establishing connection...', 'system');
}

// ── Chat ───────────────────────────────────────────────────────────────────────

function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;

  if (!dataChannel || dataChannel.readyState !== 'open') {
    addMessage('Chat not ready yet. Wait for connection.', 'system');
    return;
  }

  dataChannel.send(text);
  addMessage(text, 'you');
  input.value = '';
}

// ── Disconnect ─────────────────────────────────────────────────────────────────

function disconnect() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    document.getElementById('localVideo').srcObject = null;
    document.getElementById('remoteVideo').srcObject = null;
  }

  dataChannel = null;
  isMuted = false;
  isCameraOff = false;

  setStatus('disconnected', 'Disconnected');
  setControlsEnabled(false);
  showRemoteOverlay(true, 'Waiting for peer...');
  showLocalOverlay(false);

  const muteBtn = document.getElementById('muteBtn');
  muteBtn.textContent = '🎙 Mute Mic';
  muteBtn.classList.remove('active');

  const camBtn = document.getElementById('cameraBtn');
  camBtn.textContent = '📷 Camera Off';
  camBtn.classList.remove('active');

  addMessage('Disconnected.', 'system');
}

// ── Media Controls ─────────────────────────────────────────────────────────────

function toggleMute() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  isMuted = !isMuted;
  audioTrack.enabled = !isMuted;

  const btn = document.getElementById('muteBtn');
  btn.textContent = isMuted ? '🔇 Unmute Mic' : '🎙 Mute Mic';
  btn.classList.toggle('active', isMuted);
}

function toggleCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  isCameraOff = !isCameraOff;
  videoTrack.enabled = !isCameraOff;

  const btn = document.getElementById('cameraBtn');
  btn.textContent = isCameraOff ? '📷 Camera On' : '📷 Camera Off';
  btn.classList.toggle('active', isCameraOff);
  showLocalOverlay(isCameraOff);
}

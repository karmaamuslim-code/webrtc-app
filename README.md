# WebRTC Multimedia App — Assignment 2

## Features Implemented
- ✅ Signaling Server (Node.js + WebSocket)
- ✅ Audio & Video Streaming (webcam + microphone)
- ✅ Local & Remote video preview
- ✅ DataChannel text chat (real-time, no WebSocket)
- ✅ Connect / Disconnect buttons
- ✅ Mute / Unmute microphone
- ✅ Enable / Disable camera
- ✅ Clean, dark-theme UI with status indicators

## Project Structure

```
webrtc-app/
├── server/
│   └── signaling-server.js   ← Node.js WebSocket signaling server
├── client/
│   ├── index.html            ← Main UI
│   ├── client.js             ← WebRTC + chat logic
│   └── styles.css            ← Styling
└── package.json
```

## Setup & Run

### 1. Install Node.js
Download from https://nodejs.org (v16+ recommended)

### 2. Install dependencies
```bash
npm install
```

### 3. Start the signaling server
```bash
npm start
# or
node server/signaling-server.js
```
You should see: `Signaling server running on ws://localhost:8080`

### 4. Open the client
Open `client/index.html` in **two separate browser windows** (or two tabs).

> ⚠️ Do NOT use file:// protocol if camera/mic permissions block you. Use a local server:
> ```bash
> npx serve client
> ```
> Then open http://localhost:3000 in two windows.

### 5. Connect
- Click **Connect** in the **first** window → it sends an offer
- Click **Connect** in the **second** window → it receives the offer and answers
- Video, audio, and chat will activate once the P2P connection is established

## How It Works

### Signaling Flow
```
Browser A                  Signaling Server              Browser B
   |                            |                            |
   |-- WebSocket connect ------>|                            |
   |                            |<---- WebSocket connect ----|
   |-- { offer } ------------->|                            |
   |                            |------ { offer } --------->|
   |                            |<----- { answer } ---------|
   |<-- { answer } ------------|                            |
   |-- { ICE candidates } ---->|                            |
   |                            |--- { ICE candidates } --->|
   |<============================ P2P Connection ==========>|
```

### Key Design Points
- **Signaling server** only relays SDP and ICE messages — no media passes through it
- **Media** flows directly peer-to-peer via WebRTC
- **Chat** uses WebRTC DataChannel (not WebSocket) for true P2P messaging
- First browser to click Connect becomes the **offerer**; second becomes the **answerer**

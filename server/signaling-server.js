const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let clients = [];

wss.on('connection', (ws) => {
  console.log(`[${new Date().toISOString()}] Client connected. Total clients: ${clients.length + 1}`);
  clients.push(ws);

  // Notify the new client of their assigned index
  ws.send(JSON.stringify({ type: 'connected', clientCount: clients.length }));

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('Invalid JSON received:', e);
      return;
    }

    console.log(`[${new Date().toISOString()}] Message type: ${data.type || JSON.stringify(Object.keys(data))}`);

    // Forward message to all other connected clients
    clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  });

  ws.on('close', () => {
    console.log(`[${new Date().toISOString()}] Client disconnected.`);
    clients = clients.filter((client) => client !== ws);
    // Notify remaining clients
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'peer-disconnected' }));
      }
    });
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    clients = clients.filter((client) => client !== ws);
  });
});

console.log('Signaling server running on ws://localhost:8080');

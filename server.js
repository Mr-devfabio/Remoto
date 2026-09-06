const WebSocket = require('ws');
const express = require('express');
const app = express();
const port = 3000;

// Servidor WebSocket
const wss = new WebSocket.Server({ port: 8080 });

console.log('🚀 Servidor WebSocket rodando na porta 8080');

const rooms = new Map();

wss.on('connection', (ws) => {
    console.log('📱 Cliente conectado');
    ws.isAlive = true;
    ws.roomCode = null;
    ws.role = null;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            if (Buffer.isBuffer(message)) {
                const roomCode = ws.roomCode;
                if (roomCode && rooms.has(roomCode)) {
                    const room = rooms.get(roomCode);
                    room.viewers.forEach(viewer => {
                        if (viewer !== ws && viewer.readyState === WebSocket.OPEN) {
                            viewer.send(message);
                        }
                    });
                }
                return;
            }

            const data = JSON.parse(message.toString());
            const type = data.type;
            const room = data.room;

            if (type === 'broadcaster') {
                if (!rooms.has(room)) {
                    rooms.set(room, { broadcaster: null, viewers: [] });
                }
                const roomData = rooms.get(room);
                roomData.broadcaster = ws;
                ws.roomCode = room;
                ws.role = 'broadcaster';
                
                console.log(`📡 Broadcaster na sala ${room}`);
                
                roomData.viewers.forEach(viewer => {
                    viewer.send(JSON.stringify({
                        type: 'broadcaster_ready',
                        device: data.device || 'Unknown',
                        battery: data.battery || '100%'
                    }));
                });

            } else if (type === 'viewer') {
                if (!rooms.has(room)) {
                    rooms.set(room, { broadcaster: null, viewers: [] });
                }
                const roomData = rooms.get(room);
                roomData.viewers.push(ws);
                ws.roomCode = room;
                ws.role = 'viewer';
                
                console.log(`👁️ Viewer na sala ${room}`);
                
                if (roomData.broadcaster && roomData.broadcaster.readyState === WebSocket.OPEN) {
                    roomData.broadcaster.send(JSON.stringify({
                        type: 'viewer_connected',
                        count: roomData.viewers.length
                    }));
                }

            } else if (type === 'control') {
                const roomCode = ws.roomCode;
                if (roomCode && rooms.has(roomCode)) {
                    const roomData = rooms.get(roomCode);
                    const broadcaster = roomData.broadcaster;
                    
                    if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
                        broadcaster.send(JSON.stringify({
                            type: 'control_command',
                            action: data.action,
                            x: data.x,
                            y: data.y,
                            text: data.text,
                            startX: data.startX,
                            startY: data.startY,
                            endX: data.endX,
                            endY: data.endY
                        }));
                        console.log(`🎮 Comando ${data.action} enviado`);
                    }
                }
            }
        } catch (e) {
            console.error('❌ Erro:', e);
        }
    });

    ws.on('close', () => {
        const roomCode = ws.roomCode;
        if (roomCode && rooms.has(roomCode)) {
            const roomData = rooms.get(roomCode);
            if (ws.role === 'broadcaster') {
                roomData.broadcaster = null;
                roomData.viewers.forEach(viewer => {
                    viewer.send(JSON.stringify({ type: 'broadcaster_disconnected' }));
                });
            } else if (ws.role === 'viewer') {
                roomData.viewers = roomData.viewers.filter(v => v !== ws);
                if (roomData.broadcaster && roomData.broadcaster.readyState === WebSocket.OPEN) {
                    roomData.broadcaster.send(JSON.stringify({
                        type: 'viewer_connected',
                        count: roomData.viewers.length
                    }));
                }
            }
            if (!roomData.broadcaster && roomData.viewers.length === 0) {
                rooms.delete(roomCode);
            }
        }
    });
});

// Servidor HTTP para health check
app.get('/', (req, res) => res.send('Servidor de Streaming 🚀'));
app.get('/health', (req, res) => res.send('OK'));

app.listen(port, () => {
    console.log(`🌐 Servidor HTTP rodando em http://localhost:${port}`);
});

// Ping para manter conexões ativas
setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) {
            console.log('⏰ Cliente inativo');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

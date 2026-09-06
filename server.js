const WebSocket = require('ws');
const express = require('express');

const app = express();
const PORT = 3000;

// Servidor HTTP simples
app.get('/', (req, res) => {
    res.send('🚀 Servidor de Streaming rodando!');
});

const server = app.listen(PORT, () => {
    console.log(`✅ Servidor HTTP rodando na porta ${PORT}`);
});

// WebSocket Server
const wss = new WebSocket.Server({ 
    server: server,
    path: '/' 
});

console.log('📡 WebSocket Server iniciado em wss://' + process.env.REPL_SLUG + '.' + process.env.REPL_OWNER + '.repl.co');

const rooms = new Map();

wss.on('connection', (ws, req) => {
    console.log('📱 Cliente conectado');
    ws.isAlive = true;
    ws.roomCode = null;
    ws.role = null;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message) => {
        try {
            // Dados binários = vídeo
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

            // Mensagens JSON
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
                    if (viewer.readyState === WebSocket.OPEN) {
                        viewer.send(JSON.stringify({
                            type: 'broadcaster_ready',
                            device: data.device || 'Unknown',
                            battery: data.battery || '100%'
                        }));
                    }
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
                            endY: data.endY,
                            value: data.value
                        }));
                        console.log(`🎮 Comando ${data.action} enviado`);
                    }
                }

            } else if (type === 'status') {
                const roomCode = ws.roomCode;
                if (roomCode && rooms.has(roomCode)) {
                    const roomData = rooms.get(roomCode);
                    roomData.viewers.forEach(viewer => {
                        if (viewer !== ws && viewer.readyState === WebSocket.OPEN) {
                            viewer.send(JSON.stringify({
                                type: 'status',
                                battery: data.battery,
                                timestamp: data.timestamp
                            }));
                        }
                    });
                }

            } else if (type === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong',
                    timestamp: Date.now()
                }));
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
                console.log(`📡 Broadcaster saiu da sala ${roomCode}`);
                roomData.viewers.forEach(viewer => {
                    if (viewer.readyState === WebSocket.OPEN) {
                        viewer.send(JSON.stringify({
                            type: 'broadcaster_disconnected'
                        }));
                    }
                });

            } else if (ws.role === 'viewer') {
                roomData.viewers = roomData.viewers.filter(v => v !== ws);
                console.log(`👁️ Viewer saiu da sala ${roomCode}`);
                if (roomData.broadcaster && roomData.broadcaster.readyState === WebSocket.OPEN) {
                    roomData.broadcaster.send(JSON.stringify({
                        type: 'viewer_connected',
                        count: roomData.viewers.length
                    }));
                }
            }
            
            if (!roomData.broadcaster && roomData.viewers.length === 0) {
                rooms.delete(roomCode);
                console.log(`🧹 Sala ${roomCode} removida`);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('❌ Erro no WebSocket:', error);
    });
});

// Heartbeat
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

console.log('📊 Salas ativas: 0');
console.log('✅ Servidor pronto!');

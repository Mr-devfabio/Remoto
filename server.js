const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos (opcional)
app.use(express.static('public'));

// Criar servidor HTTP
const server = app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🌐 URL: https://diligent-connection.up.railway.app`);
});

// Criar WebSocket Server
const wss = new WebSocket.Server({ 
    server,
    path: '/ws' // Importante: mesmo caminho que o app tenta conectar
});

// Armazenar salas
const rooms = new Map();

wss.on('connection', (ws, req) => {
    console.log('🔗 Novo cliente conectado');
    
    let clientRoom = null;
    let clientType = null;
    let clientId = Date.now().toString();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Registrar broadcaster
            if (data.type === 'broadcaster') {
                const room = data.room;
                clientRoom = room;
                clientType = 'broadcaster';
                
                if (!rooms.has(room)) {
                    rooms.set(room, { broadcaster: null, viewers: [] });
                }
                
                const roomData = rooms.get(room);
                roomData.broadcaster = ws;
                
                // Enviar confirmação
                ws.send(JSON.stringify({
                    type: 'registered',
                    role: 'broadcaster',
                    room: room,
                    message: '✅ Transmissor registrado com sucesso!'
                }));
                
                console.log(`📡 Broadcaster registrado na sala: ${room}`);
                broadcastViewerCount(room);
            }
            
            // Registrar viewer
            else if (data.type === 'viewer') {
                const room = data.room;
                clientRoom = room;
                clientType = 'viewer';
                
                if (!rooms.has(room)) {
                    rooms.set(room, { broadcaster: null, viewers: [] });
                }
                
                const roomData = rooms.get(room);
                roomData.viewers.push(ws);
                
                ws.send(JSON.stringify({
                    type: 'registered',
                    role: 'viewer',
                    room: room,
                    message: '✅ Espectador conectado!'
                }));
                
                console.log(`👤 Viewer conectado na sala: ${room}`);
                broadcastViewerCount(room);
            }
            
            // Frame de vídeo
            else if (data.type === 'frame') {
                if (clientType === 'broadcaster' && clientRoom) {
                    const roomData = rooms.get(clientRoom);
                    if (roomData) {
                        // Enviar frame para todos os viewers
                        roomData.viewers.forEach((viewer) => {
                            if (viewer.readyState === WebSocket.OPEN) {
                                viewer.send(JSON.stringify({
                                    type: 'frame',
                                    data: data.data,
                                    timestamp: data.timestamp
                                }));
                            }
                        });
                    }
                }
            }
            
            // Status do broadcaster
            else if (data.type === 'status') {
                if (clientType === 'broadcaster' && clientRoom) {
                    const roomData = rooms.get(clientRoom);
                    if (roomData) {
                        roomData.viewers.forEach((viewer) => {
                            if (viewer.readyState === WebSocket.OPEN) {
                                viewer.send(JSON.stringify({
                                    type: 'status',
                                    battery: data.battery,
                                    timestamp: data.timestamp
                                }));
                            }
                        });
                    }
                }
            }
            
            // Controle do viewer
            else if (data.type === 'control') {
                if (clientType === 'viewer' && clientRoom) {
                    const roomData = rooms.get(clientRoom);
                    if (roomData && roomData.broadcaster) {
                        if (roomData.broadcaster.readyState === WebSocket.OPEN) {
                            roomData.broadcaster.send(JSON.stringify({
                                type: 'control_command',
                                action: data.action,
                                value: data.value || null
                            }));
                        }
                    }
                }
            }
            
            // Ping/Pong
            else if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
            
        } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error);
        }
    });

    ws.on('close', () => {
        console.log('🔌 Cliente desconectado');
        
        if (clientRoom) {
            const roomData = rooms.get(clientRoom);
            if (roomData) {
                // Remover broadcaster
                if (roomData.broadcaster === ws) {
                    roomData.broadcaster = null;
                    console.log(`📡 Broadcaster desconectou da sala: ${clientRoom}`);
                }
                
                // Remover viewer
                const viewerIndex = roomData.viewers.indexOf(ws);
                if (viewerIndex > -1) {
                    roomData.viewers.splice(viewerIndex, 1);
                    console.log(`👤 Viewer desconectou da sala: ${clientRoom}`);
                }
                
                // Se não tiver ninguém, remover sala
                if (!roomData.broadcaster && roomData.viewers.length === 0) {
                    rooms.delete(clientRoom);
                    console.log(`🗑️ Sala ${clientRoom} removida`);
                }
                
                broadcastViewerCount(clientRoom);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('⚠️ Erro no WebSocket:', error);
    });
});

// Função para broadcast de contagem de viewers
function broadcastViewerCount(room) {
    const roomData = rooms.get(room);
    if (roomData) {
        const count = roomData.viewers.length;
        const message = JSON.stringify({
            type: 'viewer_connected',
            count: count
        });
        
        // Enviar para o broadcaster
        if (roomData.broadcaster && roomData.broadcaster.readyState === WebSocket.OPEN) {
            roomData.broadcaster.send(message);
        }
        
        // Enviar para todos os viewers
        roomData.viewers.forEach((viewer) => {
            if (viewer.readyState === WebSocket.OPEN) {
                viewer.send(message);
            }
        });
    }
}

// Rota de status
app.get('/status', (req, res) => {
    const roomStats = {};
    for (const [room, data] of rooms) {
        roomStats[room] = {
            hasBroadcaster: data.broadcaster !== null,
            viewers: data.viewers.length
        };
    }
    
    res.json({
        status: 'online',
        totalRooms: rooms.size,
        rooms: roomStats,
        timestamp: new Date().toISOString()
    });
});

// Rota principal
app.get('/', (req, res) => {
    res.json({
        service: 'Screen Stream Server',
        status: 'running',
        websocket: '/ws',
        documentation: 'https://github.com/seu-app',
        endpoints: {
            websocket: 'wss://diligent-connection.up.railway.app/ws',
            status: '/status'
        }
    });
});

console.log('🚀 Servidor iniciado com sucesso!');

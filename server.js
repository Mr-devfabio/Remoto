const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// ROTAS HTTP
// ============================================

app.get('/', (req, res) => {
    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Screen Stream Server</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    text-align: center;
                    padding: 50px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .container {
                    background: rgba(255,255,255,0.1);
                    border-radius: 20px;
                    padding: 40px;
                    max-width: 600px;
                    margin: 0 auto;
                    backdrop-filter: blur(10px);
                }
                h1 { font-size: 48px; margin-bottom: 10px; }
                .status { color: #4ade80; font-size: 20px; }
                .info { margin: 20px 0; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 10px; }
                code { background: rgba(0,0,0,0.5); padding: 5px 10px; border-radius: 5px; word-break: break-all; }
                .url-box {
                    background: rgba(0,0,0,0.5);
                    padding: 15px;
                    border-radius: 10px;
                    margin: 15px 0;
                    border: 2px solid #4ade80;
                }
                .url-box .label { font-size: 12px; opacity: 0.7; }
                .url-box .url { font-size: 18px; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📡 Screen Stream Server</h1>
                <p class="status">✅ Servidor rodando com sucesso!</p>
                <div class="url-box">
                    <div class="label">📱 USE ESTA URL NO APP:</div>
                    <div class="url">${host}</div>
                </div>
                <div class="info">
                    <p>🔗 <strong>WebSocket:</strong> <code>${protocol}://${host}/ws</code></p>
                </div>
            </div>
        </body>
        </html>
    `);
});

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
        uptime: process.uptime(),
        totalRooms: rooms.size,
        rooms: roomStats,
        totalConnections: connections,
        timestamp: new Date().toISOString()
    });
});

app.get('/info', (req, res) => {
    res.json({
        service: 'Screen Stream Server',
        version: '1.0.0',
        websocket: '/ws',
        url: req.get('host')
    });
});

// ============================================
// WEBSOCKET SERVER
// ============================================

const rooms = new Map();
let connections = 0;
let connectionId = 0;

const server = app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 SERVIDOR INICIADO!');
    console.log('='.repeat(50));
    console.log(`📡 Porta: ${PORT}`);
    console.log('✅ Aguardando conexões...');
});

const wss = new WebSocket.Server({ 
    server,
    path: '/ws',
    perMessageDeflate: false
});

wss.on('connection', (ws, req) => {
    connections++;
    connectionId++;
    ws.id = connectionId;
    
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`🔗 [${ws.id}] Nova conexão de ${clientIP}`);
    
    let clientRoom = null;
    let clientType = null;
    let clientInfo = {};

    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Conectado ao servidor!',
        connectionId: ws.id
    }));

    // ============================================
    // 🔥 HANDLER CORRIGIDO — detecta binário ANTES de JSON
    // ============================================
    ws.on('message', (message, isBinary) => {
        
        // ========================================
        // CASO 1: BINÁRIO — frame JPEG direto
        // ========================================
        if (isBinary) {
            if (clientType === 'broadcaster' && clientRoom) {
                const roomData = rooms.get(clientRoom);
                if (roomData) {
                    let sentCount = 0;
                    roomData.viewers.forEach((viewer) => {
                        if (viewer.readyState === WebSocket.OPEN) {
                            try {
                                viewer.send(message, { binary: true });
                                sentCount++;
                            } catch (e) {}
                        }
                    });
                    if (sentCount > 0 && Math.random() < 0.1) {
                        console.log(`📤 [${ws.id}] Frame binário (${message.length}b) → ${sentCount} viewers`);
                    }
                }
            }
            return;
        }

        // ========================================
        // CASO 2: TEXTO — tenta JSON
        // ========================================
        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (error) {
            console.error(`❌ [${ws.id}] JSON inválido:`, error.message);
            return;
        }
        
        const msgType = data.type;
        
        // ========================================
        // REGISTRAR BROADCASTER
        // ========================================
        if (msgType === 'broadcaster') {
            const room = data.room;
            clientRoom = room;
            clientType = 'broadcaster';
            clientInfo = {
                device: data.device || 'Unknown',
                androidVersion: data.android_version || 'Unknown',
                battery: data.battery || 'N/A'
            };
            
            if (!rooms.has(room)) {
                rooms.set(room, { broadcaster: null, viewers: [], info: {} });
            }
            
            const roomData = rooms.get(room);
            
            if (roomData.broadcaster) {
                try {
                    roomData.broadcaster.send(JSON.stringify({
                        type: 'broadcaster_replaced'
                    }));
                    roomData.broadcaster.close();
                } catch (e) {}
            }
            
            roomData.broadcaster = ws;
            roomData.info = clientInfo;
            
            ws.send(JSON.stringify({
                type: 'registered',
                role: 'broadcaster',
                room: room,
                message: '✅ Transmissor registrado!'
            }));
            
            console.log(`📡 [${ws.id}] Broadcaster na sala: ${room}`);
            broadcastViewerCount(room);
            notifyViewersOfBroadcaster(room);
        }
        
        // ========================================
        // REGISTRAR VIEWER
        // ========================================
        else if (msgType === 'viewer') {
            const room = data.room;
            clientRoom = room;
            clientType = 'viewer';
            clientInfo = { device: data.device || 'Unknown' };
            
            if (!rooms.has(room)) {
                rooms.set(room, { broadcaster: null, viewers: [], info: {} });
            }
            
            const roomData = rooms.get(room);
            roomData.viewers.push(ws);
            
            ws.send(JSON.stringify({
                type: 'registered',
                role: 'viewer',
                room: room,
                message: '✅ Espectador conectado!'
            }));
            
            console.log(`👤 [${ws.id}] Viewer na sala: ${room}`);
            
            if (roomData.broadcaster) {
                ws.send(JSON.stringify({
                    type: 'broadcaster_ready',
                    device: roomData.info.device || 'Unknown',
                    battery: roomData.info.battery || 'N/A'
                }));
            }
            
            broadcastViewerCount(room);
        }
        
        // ========================================
        // STATUS (bateria)
        // ========================================
        else if (msgType === 'status') {
            if (clientType === 'broadcaster' && clientRoom) {
                const roomData = rooms.get(clientRoom);
                if (roomData) {
                    if (data.battery) roomData.info.battery = data.battery;
                    
                    roomData.viewers.forEach((viewer) => {
                        if (viewer.readyState === WebSocket.OPEN) {
                            try {
                                viewer.send(JSON.stringify({
                                    type: 'status',
                                    battery: data.battery
                                }));
                            } catch (e) {}
                        }
                    });
                }
            }
        }
        
        // ========================================
        // CONTROLE (toque, swipe)
        // ========================================
        else if (msgType === 'control') {
            if (clientType === 'viewer' && clientRoom) {
                const roomData = rooms.get(clientRoom);
                if (roomData && roomData.broadcaster) {
                    if (roomData.broadcaster.readyState === WebSocket.OPEN) {
                        roomData.broadcaster.send(JSON.stringify({
                            type: 'control_command',
                            action: data.action,
                            x: data.x,
                            y: data.y,
                            startX: data.startX,
                            startY: data.startY,
                            endX: data.endX,
                            endY: data.endY,
                            value: data.value || null,
                            text: data.text || null
                        }));
                    }
                }
            }
        }
        
        // ========================================
        // PING
        // ========================================
        else if (msgType === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
        }
    });

    ws.on('close', () => {
        connections--;
        console.log(`🔌 [${ws.id}] Desconectou`);
        
        if (clientRoom) {
            const roomData = rooms.get(clientRoom);
            if (roomData) {
                if (roomData.broadcaster === ws) {
                    roomData.broadcaster = null;
                    roomData.info = {};
                    console.log(`📡 Broadcaster saiu da sala: ${clientRoom}`);
                    
                    roomData.viewers.forEach((viewer) => {
                        if (viewer.readyState === WebSocket.OPEN) {
                            try {
                                viewer.send(JSON.stringify({
                                    type: 'broadcaster_disconnected'
                                }));
                            } catch (e) {}
                        }
                    });
                }
                
                const viewerIndex = roomData.viewers.indexOf(ws);
                if (viewerIndex > -1) {
                    roomData.viewers.splice(viewerIndex, 1);
                }
                
                if (!roomData.broadcaster && roomData.viewers.length === 0) {
                    rooms.delete(clientRoom);
                    console.log(`🗑️ Sala ${clientRoom} removida`);
                } else {
                    broadcastViewerCount(clientRoom);
                }
            }
        }
    });

    ws.on('error', (error) => {
        console.error(`⚠️ [${ws.id}] Erro:`, error.message);
    });
});

// FUNÇÕES AUXILIARES
function broadcastViewerCount(room) {
    const roomData = rooms.get(room);
    if (roomData) {
        const count = roomData.viewers.length;
        const message = JSON.stringify({
            type: 'viewer_connected',
            count: count
        });
        
        if (roomData.broadcaster && roomData.broadcaster.readyState === WebSocket.OPEN) {
            try { roomData.broadcaster.send(message); } catch (e) {}
        }
        
        roomData.viewers.forEach((viewer) => {
            if (viewer.readyState === WebSocket.OPEN) {
                try { viewer.send(message); } catch (e) {}
            }
        });
    }
}

function notifyViewersOfBroadcaster(room) {
    const roomData = rooms.get(room);
    if (roomData && roomData.broadcaster) {
        const message = JSON.stringify({
            type: 'broadcaster_ready',
            device: roomData.info.device || 'Unknown',
            battery: roomData.info.battery || 'N/A'
        });
        
        roomData.viewers.forEach((viewer) => {
            if (viewer.readyState === WebSocket.OPEN) {
                try { viewer.send(message); } catch (e) {}
            }
        });
    }
}

console.log('='.repeat(50));
console.log('✅ Servidor pronto!');
console.log('='.repeat(50));

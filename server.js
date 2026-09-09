const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
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
                .endpoints { text-align: left; margin: 20px 0; }
                .endpoints li { margin: 10px 0; list-style: none; }
                .badge {
                    display: inline-block;
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-size: 14px;
                    margin: 5px;
                }
                .badge-success { background: #22c55e; color: white; }
                .badge-info { background: #3b82f6; color: white; }
                .badge-warning { background: #eab308; color: white; }
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
                    <p>🌐 <strong>URL:</strong> <code>${protocol}://${host}</code></p>
                </div>
                
                <div class="endpoints">
                    <h3>📌 Endpoints:</h3>
                    <ul>
                        <li>📊 <a href="/status" style="color: #93c5fd;">/status</a> - Status do servidor</li>
                        <li>📡 <code>/ws</code> - WebSocket</li>
                        <li>📱 <a href="/info" style="color: #93c5fd;">/info</a> - Informações detalhadas</li>
                    </ul>
                </div>
                
                <div>
                    <span class="badge badge-success">✅ Online</span>
                    <span class="badge badge-info">📡 WebSocket</span>
                    <span class="badge badge-warning">🔄 Ativo</span>
                </div>
                
                <p style="margin-top: 30px; font-size: 14px; opacity: 0.7;">
                    🚀 Servidor para transmissão de tela Android
                </p>
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
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        url: req.get('host')
    });
});

app.get('/info', (req, res) => {
    res.json({
        service: 'Screen Stream Server',
        version: '1.0.0',
        websocket: '/ws',
        url: req.get('host'),
        protocol: req.headers['x-forwarded-proto'] || 'https',
        features: [
            'Transmissão de tela em tempo real',
            'Controle remoto (toque, swipe, botões)',
            'Suporte a múltiplas salas',
            'Reconexão automática',
            'Status da bateria do emissor'
        ]
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
    console.log('🚀 SERVIDOR INICIADO COM SUCESSO!');
    console.log('='.repeat(50));
    console.log(`📡 Porta: ${PORT}`);
    console.log(`🌐 URL: https://${process.env.RAILWAY_STATIC_URL || 'localhost'}`);
    console.log(`🔗 WebSocket: wss://${process.env.RAILWAY_STATIC_URL || 'localhost'}/ws`);
    console.log('='.repeat(50));
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
    console.log(`🔗 [${ws.id}] Nova conexão de ${clientIP} (${connections} conexões)`);
    
    let clientRoom = null;
    let clientType = null;
    let clientInfo = {};

    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Conectado ao servidor!',
        connectionId: ws.id,
        timestamp: new Date().toISOString()
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const msgType = data.type;
            
            console.log(`📩 [${ws.id}] ${clientType || 'unknown'}: ${msgType}`);
            
            // REGISTRAR BROADCASTER
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
                            type: 'broadcaster_replaced',
                            message: 'Outro broadcaster entrou na sala'
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
                    message: '✅ Transmissor registrado com sucesso!',
                    connections: connections,
                    timestamp: new Date().toISOString()
                }));
                
                console.log(`📡 [${ws.id}] Broadcaster registrado na sala: ${room}`);
                broadcastViewerCount(room);
                notifyViewersOfBroadcaster(room);
            }
            
            // REGISTRAR VIEWER
            else if (msgType === 'viewer') {
                const room = data.room;
                clientRoom = room;
                clientType = 'viewer';
                clientInfo = {
                    device: data.device || 'Unknown',
                    androidVersion: data.android_version || 'Unknown'
                };
                
                if (!rooms.has(room)) {
                    rooms.set(room, { broadcaster: null, viewers: [], info: {} });
                }
                
                const roomData = rooms.get(room);
                roomData.viewers.push(ws);
                
                ws.send(JSON.stringify({
                    type: 'registered',
                    role: 'viewer',
                    room: room,
                    message: '✅ Espectador conectado!',
                    connections: connections,
                    timestamp: new Date().toISOString()
                }));
                
                console.log(`👤 [${ws.id}] Viewer registrado na sala: ${room}`);
                
                if (roomData.broadcaster) {
                    ws.send(JSON.stringify({
                        type: 'broadcaster_ready',
                        device: roomData.info.device || 'Unknown',
                        battery: roomData.info.battery || 'N/A',
                        message: 'Broadcaster disponível'
                    }));
                }
                
                broadcastViewerCount(room);
            }
            
            // FRAME DE VÍDEO
            else if (msgType === 'frame') {
                if (clientType === 'broadcaster' && clientRoom) {
                    const roomData = rooms.get(clientRoom);
                    if (roomData) {
                        const frameData = {
                            type: 'frame',
                            data: data.data,
                            timestamp: data.timestamp || new Date().toISOString()
                        };
                        
                        let sentCount = 0;
                        roomData.viewers.forEach((viewer) => {
                            if (viewer.readyState === WebSocket.OPEN) {
                                try {
                                    viewer.send(JSON.stringify(frameData));
                                    sentCount++;
                                } catch (e) {}
                            }
                        });
                    }
                }
            }
            
            // STATUS
            else if (msgType === 'status') {
                if (clientType === 'broadcaster' && clientRoom) {
                    const roomData = rooms.get(clientRoom);
                    if (roomData) {
                        if (data.battery) {
                            roomData.info.battery = data.battery;
                        }
                        
                        const statusData = {
                            type: 'status',
                            battery: data.battery,
                            timestamp: data.timestamp || new Date().toISOString()
                        };
                        
                        roomData.viewers.forEach((viewer) => {
                            if (viewer.readyState === WebSocket.OPEN) {
                                try {
                                    viewer.send(JSON.stringify(statusData));
                                } catch (e) {}
                            }
                        });
                    }
                }
            }
            
            // CONTROLE
            else if (msgType === 'control') {
                if (clientType === 'viewer' && clientRoom) {
                    const roomData = rooms.get(clientRoom);
                    if (roomData && roomData.broadcaster) {
                        if (roomData.broadcaster.readyState === WebSocket.OPEN) {
                            roomData.broadcaster.send(JSON.stringify({
                                type: 'control_command',
                                action: data.action,
                                value: data.value || null,
                                timestamp: new Date().toISOString()
                            }));
                        }
                    }
                }
            }
            
            // PING
            else if (msgType === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong',
                    timestamp: new Date().toISOString()
                }));
            }
            
        } catch (error) {
            console.error(`❌ [${ws.id}] Erro ao processar mensagem:`, error);
        }
    });

    ws.on('close', () => {
        connections--;
        console.log(`🔌 [${ws.id}] Cliente desconectou (${connections} conexões)`);
        
        if (clientRoom) {
            const roomData = rooms.get(clientRoom);
            if (roomData) {
                if (roomData.broadcaster === ws) {
                    roomData.broadcaster = null;
                    roomData.info = {};
                    console.log(`📡 Broadcaster desconectou da sala: ${clientRoom}`);
                    
                    roomData.viewers.forEach((viewer) => {
                        if (viewer.readyState === WebSocket.OPEN) {
                            viewer.send(JSON.stringify({
                                type: 'broadcaster_disconnected',
                                message: 'Emissor saiu'
                            }));
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
        console.error(`⚠️ [${ws.id}] Erro no WebSocket:`, error);
    });
});

// FUNÇÕES AUXILIARES
function broadcastViewerCount(room) {
    const roomData = rooms.get(room);
    if (roomData) {
        const count = roomData.viewers.length;
        const message = JSON.stringify({
            type: 'viewer_connected',
            count: count,
            timestamp: new Date().toISOString()
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
            battery: roomData.info.battery || 'N/A',
            timestamp: new Date().toISOString()
        });
        
        roomData.viewers.forEach((viewer) => {
            if (viewer.readyState === WebSocket.OPEN) {
                try { viewer.send(message); } catch (e) {}
            }
        });
    }
}

console.log('='.repeat(50));
console.log('✅ Servidor pronto para receber conexões!');
console.log('='.repeat(50));

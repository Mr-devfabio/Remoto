const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos estáticos (opcional)
app.use(express.static('public'));

// ============================================
// ROTAS HTTP
// ============================================

// Rota principal
app.get('/', (req, res) => {
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
                code { background: rgba(0,0,0,0.5); padding: 5px 10px; border-radius: 5px; }
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
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📡 Screen Stream Server</h1>
                <p class="status">✅ Servidor rodando com sucesso!</p>
                
                <div class="info">
                    <p>🔗 <strong>WebSocket:</strong> <code>wss://${req.get('host')}/ws</code></p>
                    <p>🌐 <strong>URL:</strong> <code>https://${req.get('host')}</code></p>
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

// Rota de status
app.get('/status', (req, res) => {
    const roomStats = {};
    for (const [room, data] of rooms) {
        roomStats[room] = {
            hasBroadcaster: data.broadcaster !== null,
            viewers: data.viewers.length,
            viewerIds: data.viewers.map(v => v.id || 'unknown')
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
        nodeVersion: process.version
    });
});

// Rota de informações
app.get('/info', (req, res) => {
    res.json({
        service: 'Screen Stream Server',
        version: '1.0.0',
        websocket: '/ws',
        protocols: ['ws', 'wss'],
        maxMessageSize: '50mb',
        features: [
            'Transmissão de tela em tempo real',
            'Controle remoto (toque, swipe, botões)',
            'Suporte a múltiplas salas',
            'Reconexão automática',
            'Status da bateria do emissor'
        ],
        endpoints: {
            http: {
                '/': 'Página inicial',
                '/status': 'Status do servidor',
                '/info': 'Informações detalhadas'
            },
            websocket: {
                '/ws': 'Conexão WebSocket principal'
            }
        },
        example: {
            connect: 'wss://' + req.get('host') + '/ws',
            registerBroadcaster: {
                type: 'broadcaster',
                room: '1234',
                device: 'Samsung S23'
            },
            registerViewer: {
                type: 'viewer',
                room: '1234'
            }
        }
    });
});

// ============================================
// WEBSOCKET SERVER
// ============================================

// Armazenar salas e conexões
const rooms = new Map();
let connections = 0;
let connectionId = 0;

// Criar servidor HTTP
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

// Criar WebSocket Server
const wss = new WebSocket.Server({ 
    server,
    path: '/ws',
    perMessageDeflate: false // Desativar compressão para melhor performance
});

// ============================================
// EVENTOS DO WEBSOCKET
// ============================================

wss.on('connection', (ws, req) => {
    connections++;
    connectionId++;
    ws.id = connectionId;
    
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`🔗 [${ws.id}] Nova conexão de ${clientIP} (${connections} conexões)`);
    
    let clientRoom = null;
    let clientType = null;
    let clientInfo = {};

    // Enviar boas-vindas
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Conectado ao servidor!',
        connectionId: ws.id,
        timestamp: new Date().toISOString()
    }));

    // ============================================
    // MENSAGENS RECEBIDAS
    // ============================================
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const msgType = data.type;
            
            console.log(`📩 [${ws.id}] ${clientType || 'unknown'}: ${msgType}`);
            
            // --------------------------------------------
            // 1. REGISTRAR BROADCASTER (EMISSOR)
            // --------------------------------------------
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
                
                // Se já existe um broadcaster, desconectar o antigo
                if (roomData.broadcaster) {
                    console.log(`⚠️ [${ws.id}] Broadcaster já existe na sala ${room}, substituindo...`);
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
                
                // Confirmar registro
                ws.send(JSON.stringify({
                    type: 'registered',
                    role: 'broadcaster',
                    room: room,
                    message: '✅ Transmissor registrado com sucesso!',
                    connections: connections,
                    timestamp: new Date().toISOString()
                }));
                
                console.log(`📡 [${ws.id}] Broadcaster registrado na sala: ${room}`);
                
                // Notificar viewers
                broadcastViewerCount(room);
                notifyViewersOfBroadcaster(room);
            }
            
            // --------------------------------------------
            // 2. REGISTRAR VIEWER (ESPECTADOR)
            // --------------------------------------------
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
                
                // Confirmar registro
                ws.send(JSON.stringify({
                    type: 'registered',
                    role: 'viewer',
                    room: room,
                    message: '✅ Espectador conectado!',
                    connections: connections,
                    timestamp: new Date().toISOString()
                }));
                
                console.log(`👤 [${ws.id}] Viewer registrado na sala: ${room}`);
                
                // Informar se há broadcaster
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
            
            // --------------------------------------------
            // 3. FRAME DE VÍDEO (Broadcaster → Viewers)
            // --------------------------------------------
            else if (msgType === 'frame') {
                if (clientType === 'broadcaster' && clientRoom) {
                    const roomData = rooms.get(clientRoom);
                    if (roomData) {
                        const frameData = {
                            type: 'frame',
                            data: data.data,
                            timestamp: data.timestamp || new Date().toISOString(),
                            frameId: data.frameId || Date.now()
                        };
                        
                        // Enviar para todos os viewers
                        let sentCount = 0;
                        roomData.viewers.forEach((viewer) => {
                            if (viewer.readyState === WebSocket.OPEN) {
                                try {
                                    viewer.send(JSON.stringify(frameData));
                                    sentCount++;
                                } catch (e) {
                                    console.error(`❌ Erro ao enviar frame para viewer:`, e);
                                }
                            }
                        });
                        
                        // Atualizar qualidade do broadcaster
                        if (sentCount > 0) {
                            ws.send(JSON.stringify({
                                type: 'frame_ack',
                                sentTo: sentCount,
                                timestamp: new Date().toISOString()
                            }));
                        }
                    }
                }
            }
            
            // --------------------------------------------
            // 4. STATUS DO BROADCASTER
            // --------------------------------------------
            else if (msgType === 'status') {
                if (clientType === 'broadcaster' && clientRoom) {
                    const roomData = rooms.get(clientRoom);
                    if (roomData) {
                        // Atualizar info
                        if (data.battery) {
                            roomData.info.battery = data.battery;
                        }
                        
                        const statusData = {
                            type: 'status',
                            battery: data.battery,
                            timestamp: data.timestamp || new Date().toISOString()
                        };
                        
                        // Enviar para viewers
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
            
            // --------------------------------------------
            // 5. CONTROLE (Viewer → Broadcaster)
            // --------------------------------------------
            else if (msgType === 'control') {
                if (clientType === 'viewer' && clientRoom) {
                    const roomData = rooms.get(clientRoom);
                    if (roomData && roomData.broadcaster) {
                        if (roomData.broadcaster.readyState === WebSocket.OPEN) {
                            const controlData = {
                                type: 'control_command',
                                action: data.action,
                                value: data.value || null,
                                timestamp: new Date().toISOString()
                            };
                            
                            roomData.broadcaster.send(JSON.stringify(controlData));
                        } else {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Broadcaster offline'
                            }));
                        }
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Nenhum broadcaster na sala'
                        }));
                    }
                }
            }
            
            // --------------------------------------------
            // 6. PING / PONG
            // --------------------------------------------
            else if (msgType === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong',
                    timestamp: new Date().toISOString()
                }));
            }
            
            // --------------------------------------------
            // 7. DESCONHECIDO
            // --------------------------------------------
            else {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: `Tipo de mensagem desconhecido: ${msgType}`
                }));
            }
            
        } catch (error) {
            console.error(`❌ [${ws.id}] Erro ao processar mensagem:`, error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Erro ao processar mensagem'
            }));
        }
    });

    // ============================================
    // DESCONEXÃO
    // ============================================
    
    ws.on('close', () => {
        connections--;
        console.log(`🔌 [${ws.id}] Cliente desconectou (${connections} conexões)`);
        
        if (clientRoom) {
            const roomData = rooms.get(clientRoom);
            if (roomData) {
                // Remover broadcaster
                if (roomData.broadcaster === ws) {
                    roomData.broadcaster = null;
                    roomData.info = {};
                    console.log(`📡 [${ws.id}] Broadcaster desconectou da sala: ${clientRoom}`);
                    
                    // Notificar viewers
                    roomData.viewers.forEach((viewer) => {
                        if (viewer.readyState === WebSocket.OPEN) {
                            viewer.send(JSON.stringify({
                                type: 'broadcaster_disconnected',
                                message: 'Emissor saiu'
                            }));
                        }
                    });
                }
                
                // Remover viewer
                const viewerIndex = roomData.viewers.indexOf(ws);
                if (viewerIndex > -1) {
                    roomData.viewers.splice(viewerIndex, 1);
                    console.log(`👤 [${ws.id}] Viewer desconectou da sala: ${clientRoom}`);
                }
                
                // Se não tiver ninguém, remover sala
                if (!roomData.broadcaster && roomData.viewers.length === 0) {
                    rooms.delete(clientRoom);
                    console.log(`🗑️ Sala ${clientRoom} removida`);
                } else {
                    broadcastViewerCount(clientRoom);
                }
            }
        }
    });

    // ============================================
    // ERRO
    // ============================================
    
    ws.on('error', (error) => {
        console.error(`⚠️ [${ws.id}] Erro no WebSocket:`, error);
    });
});

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

// Broadcast de contagem de viewers
function broadcastViewerCount(room) {
    const roomData = rooms.get(room);
    if (roomData) {
        const count = roomData.viewers.length;
        const message = JSON.stringify({
            type: 'viewer_connected',
            count: count,
            timestamp: new Date().toISOString()
        });
        
        // Enviar para o broadcaster
        if (roomData.broadcaster && roomData.broadcaster.readyState === WebSocket.OPEN) {
            try {
                roomData.broadcaster.send(message);
            } catch (e) {}
        }
        
        // Enviar para todos os viewers
        roomData.viewers.forEach((viewer) => {
            if (viewer.readyState === WebSocket.OPEN) {
                try {
                    viewer.send(message);
                } catch (e) {}
            }
        });
        
        console.log(`👥 Sala ${room}: ${count} viewer(s)`);
    }
}

// Notificar viewers que um broadcaster entrou
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
                try {
                    viewer.send(message);
                } catch (e) {}
            }
        });
    }
}

// ============================================
// LIMPEZA PERIÓDICA
// ============================================

// Remover conexões mortas a cada 30 segundos
setInterval(() => {
    let cleaned = 0;
    for (const [room, roomData] of rooms) {
        // Remover viewers mortos
        const aliveViewers = roomData.viewers.filter(v => v.readyState === WebSocket.OPEN);
        if (aliveViewers.length !== roomData.viewers.length) {
            cleaned += roomData.viewers.length - aliveViewers.length;
            roomData.viewers = aliveViewers;
        }
        
        // Remover broadcaster morto
        if (roomData.broadcaster && roomData.broadcaster.readyState !== WebSocket.OPEN) {
            roomData.broadcaster = null;
            roomData.info = {};
            console.log(`🧹 Broadcaster morto removido da sala ${room}`);
        }
        
        // Remover sala vazia
        if (!roomData.broadcaster && roomData.viewers.length === 0) {
            rooms.delete(room);
            console.log(`🧹 Sala ${room} removida (limpeza)`);
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 ${cleaned} conexões mortas removidas`);
    }
}, 30000);

console.log('='.repeat(50));
console.log('✅ Servidor pronto para receber conexões!');
console.log('='.repeat(50));

const express = require('express');
const WebSocket = require('ws');
const app = express();
const PORT = process.env.PORT || 3000;

// Rota principal
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Screen Stream Server</title>
            <style>
                body { font-family: Arial; text-align: center; padding: 50px; }
                .status { color: green; font-size: 24px; }
            </style>
        </head>
        <body>
            <h1>📡 Screen Stream Server</h1>
            <p class="status">✅ Servidor rodando com sucesso!</p>
            <p>WebSocket: <code>wss://${req.get('host')}/ws</code></p>
            <p>Status: <a href="/status">/status</a></p>
        </body>
        </html>
    `);
});

// Rota de status
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        websocket: '/ws',
        connections: wss ? 'active' : 'inactive'
    });
});

// Criar servidor HTTP
const server = app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🌐 URL: https://${process.env.RAILWAY_STATIC_URL || 'localhost'}`);
});

// Criar WebSocket Server
const wss = new WebSocket.Server({ server, path: '/ws' });
let connections = 0;

wss.on('connection', (ws) => {
    connections++;
    console.log(`🔗 Cliente conectado (${connections} conexões)`);
    
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Conectado ao servidor!',
        connections: connections
    }));
    
    ws.on('message', (message) => {
        console.log('📩 Mensagem recebida:', message.toString());
        try {
            const data = JSON.parse(message);
            
            // Responder com eco
            ws.send(JSON.stringify({
                type: 'echo',
                received: data,
                timestamp: new Date().toISOString()
            }));
            
        } catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'JSON inválido'
            }));
        }
    });
    
    ws.on('close', () => {
        connections--;
        console.log(`🔌 Cliente desconectado (${connections} conexões)`);
    });
});

console.log('🚀 Servidor WebSocket pronto em /ws');

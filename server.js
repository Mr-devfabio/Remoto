const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Servidor funcionando!',
        websocket: '/ws'
    });
});

app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

const server = app.listen(PORT, () => {
    console.log(`✅ Servidor HTTP rodando na porta ${PORT}`);
});

// WebSocket simples
const WebSocket = require('ws');
const wss = new WebSocket.Server({ 
    server,
    path: '/ws'
});

wss.on('connection', (ws) => {
    console.log('✅ Cliente WebSocket conectado');
    
    ws.send(JSON.stringify({
        type: 'connected',
        message: 'Bem-vindo!'
    }));
    
    ws.on('message', (data) => {
        console.log('📩 Mensagem:', data.toString());
        ws.send(JSON.stringify({
            type: 'echo',
            data: data.toString()
        }));
    });
});

console.log('🚀 Servidor pronto!');

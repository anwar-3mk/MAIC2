const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*" }
});

app.use(express.json());
app.use(express.static('public'));

// تخزين بيانات اللاعبين
// { userId: { pos: {x,y,z}, socketId: "...", name: "..." } }
let playersData = {};
let linkCodes = {}; // { code: userId }

// استقبال الإحداثيات من روبلوكس
app.post('/update_positions', (req, res) => {
    const { players } = req.body;
    if (!players) return res.status(400).send("No players data");

    players.forEach(p => {
        if (playersData[p.userId]) {
            playersData[p.userId].pos = p.pos;
        }
    });

    // إرسال التحديثات لكل المتصفحات المتصلة
    io.emit('positions_updated', playersData);
    res.send("OK");
});

// إنشاء كود ربط جديد (يطلبه روبلوكس)
app.get('/generate_code/:userId', (req, res) => {
    const userId = req.params.userId;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    linkCodes[code] = userId;
    res.json({ code });
});

io.on('connection', (socket) => {
    console.log('New browser connected:', socket.id);

    socket.on('link_account', (code) => {
        const userId = linkCodes[code];
        if (userId) {
            playersData[userId] = {
                socketId: socket.id,
                pos: { x: 0, y: 0, z: 0 },
                userId: userId
            };
            socket.userId = userId;
            socket.emit('link_success', { userId });
            console.log(`User ${userId} linked to socket ${socket.id}`);
            delete linkCodes[code];
        } else {
            socket.emit('link_error', "كود غير صالح");
        }
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            delete playersData[socket.userId];
        }
    });

    // تبادل بيانات WebRTC (الصوت)
    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal,
            userId: socket.userId
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Mic Server running on port ${PORT}`);
});

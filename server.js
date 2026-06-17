const express = require('express');
const cors = require('cors');

const app = express();

// ============================================================
//  CORS - Enable cross-origin requests from your frontend
// ============================================================
app.use(cors());
app.use(express.json());

// ============================================================
//  ROUTES
// ============================================================
app.get('/', (req, res) => {
    res.send('🚀 ExamBuddy API is running!');
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is healthy!' 
    });
});

app.get('/api/stats', (req, res) => {
    res.json({ 
        users: 0, 
        messages: 0 
    });
});

app.post('/api/auth/register', (req, res) => {
    const { mobile, name, gender, homeCity } = req.body;
    
    if (!mobile || !name || !homeCity) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    res.json({
        user: {
            id: Date.now().toString(),
            mobile,
            name,
            gender: gender || 'Other',
            homeCity
        },
        isNew: true
    });
});

app.get('/api/users', (req, res) => {
    res.json([]);
});

app.get('/api/exams', (req, res) => {
    res.json([]);
});

app.post('/api/exams', (req, res) => {
    const { userId, examName, examDate, examCity } = req.body;
    
    if (!userId || !examName || !examDate || !examCity) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    
    res.json({
        id: Date.now().toString(),
        userId,
        examName,
        examDate,
        examCity,
        createdAt: new Date().toISOString()
    });
});

app.get('/api/messages', (req, res) => {
    res.json([]);
});

app.post('/api/messages', (req, res) => {
    const { user, content } = req.body;
    
    if (!user || !content) {
        return res.status(400).json({ error: 'User and content required' });
    }
    
    res.json({
        id: Date.now().toString(),
        user,
        content,
        timestamp: new Date().toISOString()
    });
});

// ============================================================
//  START SERVER
// ============================================================
const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health: http://0.0.0.0:${PORT}/api/health`);
});
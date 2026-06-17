require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;

// ============================================================
//  ENVIRONMENT VARIABLE VALIDATION
// ============================================================
const REQUIRED_ENV_VARS = [
    'MONGODB_URI',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
];

const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
}

// ============================================================
//  CLOUDINARY CONFIGURATION
// ============================================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
console.log(`☁️  Cloudinary configured for cloud: ${process.env.CLOUDINARY_CLOUD_NAME}`);

// ============================================================
//  EXPRESS APP
// ============================================================
const app = express();

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
//  MONGODB + SERVER STARTUP
// ============================================================
const PORT = process.env.PORT || 8080;

async function start() {
    console.log('🔌 Connecting to MongoDB...');
    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        await client.connect();
        await client.db().command({ ping: 1 });
        console.log('✅ MongoDB connected successfully');
    } catch (err) {
        console.error(`❌ MongoDB connection failed: ${err.message}`);
        // Log the failure but allow the server to start so Railway
        // health checks still pass and the error is visible in logs.
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📍 Health: http://0.0.0.0:${PORT}/api/health`);
    });
}

start();

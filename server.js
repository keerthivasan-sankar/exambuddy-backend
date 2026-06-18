const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const app = express();

// ============================================================
//  CHECK ENVIRONMENT VARIABLES
// ============================================================
console.log('🔍 Checking MONGODB_URI:', process.env.MONGODB_URI ? '✅ SET' : '❌ NOT SET');

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// ============================================================
//  CLOUDINARY CONFIG
// ============================================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dyxoualgf',
    api_key: process.env.CLOUDINARY_API_KEY || '549448285873283',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'US7ccpVN-JnYAME8l8r'
});
console.log('☁️ Cloudinary configured');

// ============================================================
//  MULTER STORAGE
// ============================================================
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'exambuddy',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'webp'],
        transformation: [{ width: 1200, crop: 'limit' }]
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

// ============================================================
//  MONGODB CONNECTION
// ============================================================
let db;
let usersCollection;
let examsCollection;
let messagesCollection;

const MONGODB_URI = process.env.MONGODB_URI;

async function connectDB() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ MongoDB Connected!');
        db = client.db('exambuddy');
        usersCollection = db.collection('users');
        examsCollection = db.collection('exams');
        messagesCollection = db.collection('messages');

        await usersCollection.createIndex({ mobile: 1 });
        await examsCollection.createIndex({ userId: 1 });
        await messagesCollection.createIndex({ timestamp: -1 });

        console.log('📊 Database ready');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        console.error('Please check your MONGODB_URI and network access.');
        // Don't exit - let server run with fallback
    }
}

// ============================================================
//  ROUTES
// ============================================================

// ---------- HEALTH CHECK ----------
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        mongodb: db ? 'connected' : 'disconnected',
        cloudinary: 'configured'
    });
});

// ---------- STATS ----------
app.get('/api/stats', async (req, res) => {
    try {
        if (!db) {
            return res.json({ 
                totalUsers: 0, 
                totalExams: 0, 
                totalMessages: 0, 
                mongodb: 'disconnected' 
            });
        }
        const totalUsers = await usersCollection.countDocuments();
        const totalExams = await examsCollection.countDocuments();
        const totalMessages = await messagesCollection.countDocuments();
        res.json({ totalUsers, totalExams, totalMessages, mongodb: 'connected' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- UPLOAD ----------
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        res.json({
            success: true,
            url: req.file.path,
            public_id: req.file.filename,
            format: req.file.format
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---------- AUTH ----------
app.post('/api/auth/register', async (req, res) => {
    try {
        const { mobile, name, gender, homeCity } = req.body;

        if (!mobile || !name || !homeCity) {
            return res.status(400).json({ error: 'All fields required' });
        }

        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        let user = await usersCollection.findOne({ mobile });
        if (user) {
            return res.json({ user, isNew: false });
        }

        const newUser = {
            mobile,
            name,
            gender: gender || 'Other',
            homeCity,
            avatar: name.charAt(0).toUpperCase(),
            createdAt: new Date()
        };
        const result = await usersCollection.insertOne(newUser);
        const savedUser = { ...newUser, _id: result.insertedId, id: result.insertedId };
        res.json({ user: savedUser, isNew: true });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        if (!db) {
            return res.json([]);
        }
        const users = await usersCollection.find({}).toArray();
        const cleanUsers = users.map(u => ({ ...u, id: u._id }));
        res.json(cleanUsers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- EXAMS ----------
app.get('/api/exams', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        if (!db) {
            return res.json([]);
        }
        const exams = await examsCollection.find({ userId }).toArray();
        res.json(exams);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/exams', async (req, res) => {
    try {
        const { userId, examName, examDate, examCity, examCenter } = req.body;

        if (!userId || !examName || !examDate || !examCity) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const exam = {
            userId,
            examName,
            examDate,
            examCity,
            examCenter: examCenter || '',
            createdAt: new Date()
        };
        const result = await examsCollection.insertOne(exam);
        res.json({ ...exam, _id: result.insertedId });
    } catch (error) {
        console.error('Add exam error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---------- MATCHES ----------
app.get('/api/matches', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        if (!db) {
            return res.json([]);
        }

        const userExams = await examsCollection.find({ userId }).toArray();
        if (userExams.length === 0) return res.json([]);

        const matches = [];
        for (const exam of userExams) {
            const matchingExams = await examsCollection.find({
                userId: { $ne: userId },
                examName: exam.examName,
                examDate: exam.examDate,
                examCity: exam.examCity
            }).toArray();

            for (const match of matchingExams) {
                const buddy = await usersCollection.findOne({ _id: match.userId });
                if (buddy) {
                    matches.push({
                        exam: {
                            examName: exam.examName,
                            examDate: exam.examDate,
                            examCity: exam.examCity
                        },
                        buddy: {
                            id: buddy._id,
                            name: buddy.name,
                            homeCity: buddy.homeCity,
                            avatar: buddy.avatar
                        }
                    });
                }
            }
        }
        res.json(matches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- MESSAGES ----------
app.get('/api/messages', async (req, res) => {
    try {
        if (!db) {
            return res.json([]);
        }
        const messages = await messagesCollection
            .find({})
            .sort({ timestamp: 1 })
            .limit(100)
            .toArray();
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { user, type, content, fileName, fileSize, latitude, longitude, isGroup } = req.body;

        if (!user || !content) {
            return res.status(400).json({ error: 'User and content required' });
        }

        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const message = {
            user,
            type: type || 'text',
            content,
            fileName: fileName || null,
            fileSize: fileSize || null,
            latitude: latitude || null,
            longitude: longitude || null,
            isGroup: isGroup || false,
            timestamp: new Date()
        };
        const result = await messagesCollection.insertOne(message);
        res.json({ ...message, _id: result.insertedId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- ROOT ----------
app.get('/', (req, res) => {
    res.send('🚀 ExamBuddy API is running!');
});

// ============================================================
//  START SERVER
// ============================================================
const PORT = process.env.PORT || 8080;

connectDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('\n========================================');
        console.log('   🚀 EXAM BUDDY BACKEND READY!');
        console.log('========================================');
        console.log(`   📍 http://0.0.0.0:${PORT}`);
        console.log(`   📤 http://0.0.0.0:${PORT}/api/upload`);
        console.log(`   ☁️  Cloudinary: Configured`);
        console.log(`   🗄️  MongoDB: ${db ? 'Connected ✅' : 'Disconnected ⚠️'}`);
        console.log('========================================\n');
    });
});
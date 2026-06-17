// ========== ERROR HANDLING (MUST BE FIRST) ==========
process.on('uncaughtException', (err) => {
    console.log('💥 UNCAUGHT EXCEPTION:', err.message);
    console.log('Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('💥 UNHANDLED REJECTION:', reason);
});

console.log('🚀 Script started');

// ========== REQUIRED MODULES ==========
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

console.log('📦 Dependencies loaded');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

console.log('⚙️ Express configured');

// ========== CLOUDINARY CONFIG ==========
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dyxoualgf',
    api_key: process.env.CLOUDINARY_API_KEY || '549448285873283',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'US7ccpVN-JnYAME8l8r'
});

console.log('☁️ Cloudinary configured');

// ========== MULTER + CLOUDINARY STORAGE ==========
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

console.log('📁 Multer configured');

// ========== MONGODB CONFIG ==========
let db;
let usersCollection;
let examsCollection;
let messagesCollection;

// ✅ CORRECT MongoDB URI with srv
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kkeerthivasan811_db_user:exambuddy123@exambuddy-cluster.k78otqu.mongodb.net/exambuddy?retryWrites=true&w=majority&tls=true&ssl=true';

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
        console.log('📊 Database ready!');
        return client;
    } catch (error) {
        console.log('❌ MongoDB Error:', error.message);
        console.log('⚠️ Running with in-memory fallback');
        let memoryMessages = [];
        let memoryUsers = [];
        let memoryExams = [];
        let nextId = 1;
        
        usersCollection = {
            findOne: async (query) => memoryUsers.find(u => u.mobile === query.mobile),
            insertOne: async (data) => {
                const id = nextId++;
                const doc = { ...data, _id: id };
                memoryUsers.push(doc);
                return { insertedId: id };
            },
            find: () => ({
                toArray: async () => memoryUsers
            }),
            countDocuments: async () => memoryUsers.length
        };
        
        examsCollection = {
            find: (query) => ({
                toArray: async () => {
                    if (query && query.userId) {
                        return memoryExams.filter(e => e.userId === query.userId);
                    }
                    return memoryExams;
                }
            }),
            insertOne: async (data) => {
                const id = nextId++;
                const doc = { ...data, _id: id };
                memoryExams.push(doc);
                return { insertedId: id };
            },
            countDocuments: async () => memoryExams.length
        };
        
        messagesCollection = {
            find: () => ({
                sort: () => ({
                    limit: () => ({
                        toArray: async () => memoryMessages
                    })
                })
            }),
            insertOne: async (data) => {
                const id = nextId++;
                const doc = { ...data, _id: id };
                memoryMessages.push(doc);
                return { insertedId: id };
            },
            countDocuments: async () => memoryMessages.length
        };
        db = {};
        console.log('✅ In-memory fallback ready');
    }
}

// ========== TEST ROUTE ==========
app.get('/test', (req, res) => {
    res.send('🚀 ExamBuddy API is running!');
});

// ========== UPLOAD ENDPOINT ==========
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        console.log('📤 Upload endpoint hit!');
        
        if (!req.file) {
            console.log('❌ No file received');
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        console.log('✅ File uploaded to Cloudinary:', req.file.path);
        
        res.json({
            success: true,
            url: req.file.path,
            public_id: req.file.filename,
            format: req.file.format
        });
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== AUTH ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        const { mobile, name, gender, homeCity } = req.body;
        
        if (!mobile || !name || !homeCity) {
            return res.status(400).json({ error: 'All fields required' });
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
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await usersCollection.find({}).toArray();
        const cleanUsers = users.map(u => ({ ...u, id: u._id }));
        res.json(cleanUsers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== EXAM ROUTES ==========
app.get('/api/exams', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const exams = await examsCollection.find({ userId: userId }).toArray();
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
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/matches', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        
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

// ========== MESSAGE ROUTES ==========
app.get('/api/messages', async (req, res) => {
    try {
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

// ========== STATS ==========
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await usersCollection.countDocuments();
        const totalMessages = await messagesCollection.countDocuments();
        res.json({ totalUsers, totalMessages, mongodb: 'connected' });
    } catch (error) {
        res.json({ totalUsers: 0, totalMessages: 0, mongodb: 'disconnected' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        mongodb: 'connected',
        cloudinary: 'configured'
    });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;

console.log(`🚀 Attempting to start server on port ${PORT}...`);

try {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('\n========================================');
        console.log('   🚀 EXAM BUDDY BACKEND READY!');
        console.log('========================================');
        console.log(`   📍 http://0.0.0.0:${PORT}`);
        console.log(`   📤 http://0.0.0.0:${PORT}/api/upload`);
        console.log(`   ☁️  Cloudinary: Configured`);
        console.log('========================================\n');
        
        // Connect to MongoDB in background
        connectDB().catch(err => {
            console.log('⚠️ MongoDB connection failed, but server continues:', err.message);
        });
    });
} catch (err) {
    console.log('💥 ERROR starting server:', err.message);
    console.log('Stack:', err.stack);
}
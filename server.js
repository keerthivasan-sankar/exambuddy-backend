require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

const app = express();

// ==================== CORS MIDDLEWARE (FULLY FIXED) ====================
console.log('🔧 Configuring CORS...');

// Allow all origins for development
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // Allow any origin in development
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.header('Access-Control-Expose-Headers', 'Content-Length, X-Requested-With');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).send('OK');
    }
    next();
});

// Logging middleware for debugging
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url} from ${req.headers.origin || 'unknown'}`);
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== CLOUDINARY CONFIG ====================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dyxoualgf',
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ==================== MULTER CONFIG ====================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg'];
        if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed'), false);
        }
    }
});

// ==================== MONGODB CONNECTION ====================
console.log('🔗 Connecting to MongoDB...');

if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in .env file!');
    console.error('📝 Please add MONGODB_URI to your .env file');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ MongoDB Connected successfully!');
})
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
});

// ==================== MODELS ====================

// User Schema
const userSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Other' },
    homeCity: { type: String, required: true },
    verified: { type: Boolean, default: true },
    avatar: { type: String },
    avatarPublicId: { type: String },
    createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', function(next) {
    if (!this.avatar) {
        this.avatar = this.name.charAt(0).toUpperCase();
    }
    next();
});

const User = mongoose.model('User', userSchema);

// Exam Schema
const examSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    examName: { type: String, required: true },
    examDate: { type: String, required: true },
    examCity: { type: String, required: true },
    examCenter: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const Exam = mongoose.model('Exam', examSchema);

// ==================== FIXED MESSAGE SCHEMA ====================
const messageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    message: { type: String, required: true },
    messageType: { type: String, enum: ['text', 'image', 'video', 'file', 'location'], default: 'text' },
    fileUrl: { type: String },
    filePublicId: { type: String },
    fileName: { type: String },
    fileSize: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    // ===== CHAT SEPARATION FIELDS =====
    chatType: { type: String, enum: ['global', 'group', 'private'], required: true, default: 'global' },
    chatId: { type: String, required: true, default: 'global' },
    groupId: { type: String, default: 'global' },
    privateChatId: { type: String },
    targetUserId: { type: String },
    receiverId: { type: String },
    timestamp: { type: Date, default: Date.now }
});

// Indexes for faster queries
messageSchema.index({ chatId: 1, chatType: 1 });
messageSchema.index({ chatType: 1, groupId: 1 });
messageSchema.index({ chatType: 1, privateChatId: 1 });
messageSchema.index({ timestamp: -1 });

const Message = mongoose.model('Message', messageSchema);

// Travel Plan Schema
const travelPlanSchema = new mongoose.Schema({
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    travelMode: { type: String, enum: ['Train', 'Bus', 'Cab', 'Flight', 'Other'], default: 'Train' },
    departureTime: { type: String },
    departureLocation: { type: String },
    contactInfo: { type: String },
    notes: { type: String },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now }
});

const TravelPlan = mongoose.model('TravelPlan', travelPlanSchema);

// ==================== BLOCK SCHEMA ====================
const blockSchema = new mongoose.Schema({
    blockerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

// Compound index to prevent duplicate blocks
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

const Block = mongoose.model('Block', blockSchema);

// ==================== AUTH MIDDLEWARE ====================
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('❌ Auth Error:', error.message);
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// ==================== API ROUTES ====================

// Health Check
app.get('/', (req, res) => {
    res.send('ExamBuddy API is running!');
});

app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working!', timestamp: new Date().toISOString() });
});

app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalExams = await Exam.countDocuments();
        const totalMessages = await Message.countDocuments();
        const totalBlocks = await Block.countDocuments();

        res.json({
            totalUsers,
            totalExams,
            totalMessages,
            totalBlocks,
            mongodb: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({ error: error.message || 'Server error' });
    }
});

app.get('/api/cloudinary-status', (req, res) => {
    res.json({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'Not set',
        api_key: process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Missing',
        api_secret: process.env.CLOUDINARY_API_SECRET ? '✅ Set' : '❌ Missing',
        configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
    });
});

// ---------- AUTH ROUTES ----------
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log('📝 Register request:', req.body);
        
        const { mobile, name, gender, homeCity } = req.body;

        if (!mobile || !name || !homeCity) {
            return res.status(400).json({ error: 'Please fill all required fields' });
        }
        if (!/^\d{10}$/.test(mobile)) {
            return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
        }

        let user = await User.findOne({ mobile });

        if (user) {
            const token = jwt.sign(
                { id: user._id, mobile: user.mobile },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRE || '7d' }
            );
            return res.json({ user, token, isNew: false });
        }

        user = new User({ mobile, name, gender, homeCity });
        await user.save();

        const token = jwt.sign(
            { id: user._id, mobile: user.mobile },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        console.log('✅ User registered:', user.name);
        res.status(201).json({ user, token, isNew: true });
    } catch (error) {
        console.error('❌ Register Error:', error);
        res.status(500).json({ error: error.message || 'Server error' });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        res.json({ user: req.user });
    } catch (error) {
        console.error('❌ Auth me error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---------- EXAM ROUTES ----------
app.get('/api/exams', authMiddleware, async (req, res) => {
    try {
        const exams = await Exam.find().sort({ createdAt: -1 }).populate('userId', 'name mobile avatar homeCity gender');
        console.log(`📚 Sending ${exams.length} exams`);
        res.json(exams);
    } catch (error) {
        console.error('❌ Get exams error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/exams', authMiddleware, async (req, res) => {
    try {
        console.log('📝 Add exam request:', req.body);
        
        const { examName, examDate, examCity, examCenter } = req.body;

        if (!examName || !examDate || !examCity) {
            return res.status(400).json({ error: 'Please fill all required fields' });
        }

        const exam = new Exam({
            userId: req.user._id,
            examName,
            examDate,
            examCity,
            examCenter: examCenter || ''
        });

        await exam.save();
        console.log('✅ Exam added:', exam.examName);
        res.status(201).json(exam);
    } catch (error) {
        console.error('❌ Create Exam Error:', error);
        res.status(500).json({ error: error.message || 'Server error' });
    }
});

app.delete('/api/exams/:id', authMiddleware, async (req, res) => {
    try {
        const exam = await Exam.findOne({ _id: req.params.id, userId: req.user._id });
        if (!exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        await exam.deleteOne();
        res.json({ message: 'Exam deleted successfully' });
    } catch (error) {
        console.error('❌ Delete Exam Error:', error);
        res.status(500).json({ error: error.message || 'Server error' });
    }
});

// ---------- MATCHING ROUTES ----------
app.get('/api/matches', authMiddleware, async (req, res) => {
    try {
        const userExams = await Exam.find({ userId: req.user._id });

        if (userExams.length === 0) {
            return res.json([]);
        }

        const matches = [];

        for (const exam of userExams) {
            const matchingExams = await Exam.find({
                _id: { $ne: exam._id },
                examName: exam.examName,
                examDate: exam.examDate,
                examCity: exam.examCity
            }).populate('userId', 'name mobile avatar homeCity gender');

            for (const matchingExam of matchingExams) {
                const buddy = matchingExam.userId;
                if (buddy && buddy._id.toString() !== req.user._id.toString()) {
                    matches.push({
                        exam: {
                            id: exam._id,
                            examName: exam.examName,
                            examDate: exam.examDate,
                            examCity: exam.examCity,
                            examCenter: exam.examCenter
                        },
                        buddy: {
                            id: buddy._id,
                            name: buddy.name,
                            mobile: buddy.mobile,
                            avatar: buddy.avatar,
                            homeCity: buddy.homeCity,
                            gender: buddy.gender
                        },
                        buddyExam: {
                            examCenter: matchingExam.examCenter
                        }
                    });
                }
            }
        }

        // Remove duplicates
        const uniqueMatches = [];
        const seen = new Set();
        for (const match of matches) {
            const key = `${match.buddy.id}-${match.exam.id}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueMatches.push(match);
            }
        }

        res.json(uniqueMatches);
    } catch (error) {
        console.error('❌ Matches Error:', error);
        res.status(500).json({ error: error.message || 'Server error' });
    }
});

// ==================== BLOCK ROUTES ====================

// Block a user
app.post('/api/blocks', authMiddleware, async (req, res) => {
    try {
        const { blockedId } = req.body;
        const blockerId = req.user._id;

        if (!blockedId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        if (blockerId.toString() === blockedId.toString()) {
            return res.status(400).json({ error: 'You cannot block yourself' });
        }

        // Check if user exists
        const userToBlock = await User.findById(blockedId);
        if (!userToBlock) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if already blocked
        const existingBlock = await Block.findOne({ blockerId, blockedId });
        if (existingBlock) {
            return res.status(400).json({ error: 'User already blocked' });
        }

        const block = new Block({ blockerId, blockedId });
        await block.save();

        console.log(`🔒 User ${req.user.name} blocked ${userToBlock.name}`);
        res.status(201).json({ 
            message: 'User blocked successfully', 
            block,
            blockedUser: userToBlock
        });

    } catch (error) {
        console.error('❌ Block error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Unblock a user
app.delete('/api/blocks/:blockedId', authMiddleware, async (req, res) => {
    try {
        const { blockedId } = req.params;
        const blockerId = req.user._id;

        const result = await Block.findOneAndDelete({ blockerId, blockedId });
        
        if (!result) {
            return res.status(404).json({ error: 'Block not found' });
        }

        console.log(`🔓 User ${req.user.name} unblocked user ${blockedId}`);
        res.json({ message: 'User unblocked successfully' });

    } catch (error) {
        console.error('❌ Unblock error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check if a user is blocked
app.get('/api/blocks/:userId/check', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const blockerId = req.user._id;

        const block = await Block.findOne({ blockerId, blockedId: userId });
        res.json({ isBlocked: !!block });

    } catch (error) {
        console.error('❌ Check block error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all blocked users
app.get('/api/blocks', authMiddleware, async (req, res) => {
    try {
        const blocks = await Block.find({ blockerId: req.user._id })
            .populate('blockedId', 'name avatar homeCity mobile');
        
        res.json(blocks.map(b => b.blockedId));

    } catch (error) {
        console.error('❌ Get blocks error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get blocked users with full details
app.get('/api/blocks/details', authMiddleware, async (req, res) => {
    try {
        const blocks = await Block.find({ blockerId: req.user._id })
            .populate('blockedId', 'name avatar homeCity mobile gender')
            .sort({ createdAt: -1 });
        
        res.json(blocks);

    } catch (error) {
        console.error('❌ Get blocks details error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== COMPLETELY FIXED MESSAGE ROUTES ====================

// ===== GET Messages - FIXED with proper filtering =====
app.get('/api/messages', authMiddleware, async (req, res) => {
    try {
        const { chatType, chatId, groupId, privateChatId, targetUserId } = req.query;
        let filter = {};
        
        console.log('📨 GET /api/messages - Query:', req.query);
        
        // ===== BUILD FILTER BASED ON CHAT TYPE =====
        if (chatType === 'private') {
            // 🔒 PRIVATE CHAT: Filter by chatType AND privateChatId
            const userId = req.user._id.toString();
            let chatIdToUse = privateChatId;
            
            // If no privateChatId provided but targetUserId is, generate it
            if (!chatIdToUse && targetUserId) {
                chatIdToUse = [userId, targetUserId].sort().join('_');
            }
            
            if (chatIdToUse) {
                filter = { 
                    chatType: 'private',
                    privateChatId: chatIdToUse
                };
                console.log(`🔒 Private chat filter for chatId: ${chatIdToUse}`);
            } else {
                // Fallback: Get all private messages for this user
                filter = { 
                    chatType: 'private',
                    $or: [
                        { userId: req.user._id },
                        { targetUserId: req.user._id.toString() }
                    ]
                };
                console.log('🔒 Private chat filter (all user chats)');
            }
        } else if (chatType === 'group') {
            // 👥 GROUP CHAT: Filter by chatType AND groupId
            filter = { 
                chatType: 'group',
                groupId: groupId || 'global'
            };
            console.log(`👥 Group chat filter for group: ${groupId || 'global'}`);
        } else if (chatType === 'global') {
            // 🌍 GLOBAL CHAT: Filter by chatType 'global'
            filter = { chatType: 'global' };
            console.log('🌍 Global chat filter');
        } else if (chatId) {
            // 📌 ANY CHAT: Filter by chatId (works for any type)
            filter = { chatId: chatId };
            console.log(`📌 Chat ID filter: ${chatId}`);
        } else {
            // ⚠️ DEFAULT: Return only global messages
            filter = { chatType: 'global' };
            console.log('🌍 Default: Global chat filter');
        }

        // Execute query with filter
        const messages = await Message.find(filter)
            .sort({ timestamp: 1 })
            .limit(100)
            .populate('userId', 'name avatar');
        
        console.log(`📨 Sending ${messages.length} messages (Filter: ${JSON.stringify(filter)})`);
        res.json(messages);
    } catch (error) {
        console.error('❌ Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// ===== POST Message - FIXED with chatId =====
app.post('/api/messages', authMiddleware, async (req, res) => {
    try {
        console.log('📨 POST /api/messages - Body:', req.body);
        
        const { 
            message, 
            chatType, 
            chatId, 
            groupId, 
            privateChatId, 
            targetUserId,
            messageType,
            fileUrl,
            fileName,
            fileSize,
            latitude,
            longitude
        } = req.body;

        // ===== VALIDATION =====
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        // Get user info
        const user = req.user;

        // ===== BUILD MESSAGE OBJECT =====
        const messageData = {
            userId: user._id,
            userName: user.name,
            message: message.trim(),
            messageType: messageType || 'text',
            timestamp: new Date()
        };

        // Add optional fields
        if (fileUrl) messageData.fileUrl = fileUrl;
        if (fileName) messageData.fileName = fileName;
        if (fileSize) messageData.fileSize = fileSize;
        if (latitude) messageData.latitude = latitude;
        if (longitude) messageData.longitude = longitude;

        // ===== DETERMINE CHAT TYPE AND SET APPROPRIATE FIELDS =====
        let finalChatType = chatType || 'global';
        let finalChatId = chatId || 'global';
        let finalGroupId = groupId || 'global';
        let finalPrivateChatId = privateChatId || null;
        let finalTargetUserId = targetUserId || null;

        if (finalChatType === 'private') {
            // 🔒 PRIVATE CHAT
            if (!targetUserId) {
                return res.status(400).json({ error: 'targetUserId is required for private messages' });
            }
            
            // Generate consistent privateChatId
            const userIds = [user._id.toString(), targetUserId].sort();
            finalPrivateChatId = userIds.join('_');
            finalChatId = finalPrivateChatId;
            finalTargetUserId = targetUserId;
            
            messageData.chatType = 'private';
            messageData.chatId = finalChatId;
            messageData.privateChatId = finalPrivateChatId;
            messageData.targetUserId = finalTargetUserId;
            messageData.receiverId = targetUserId;
            messageData.groupId = finalPrivateChatId;
            
            console.log(`🔒 Private message to: ${targetUserId}, ChatId: ${finalPrivateChatId}`);
        } else if (finalChatType === 'group') {
            // 👥 GROUP CHAT
            if (!groupId) {
                return res.status(400).json({ error: 'groupId is required for group messages' });
            }
            
            finalChatId = groupId;
            finalGroupId = groupId;
            
            messageData.chatType = 'group';
            messageData.chatId = finalChatId;
            messageData.groupId = finalGroupId;
            
            console.log(`👥 Group message in: ${groupId}`);
        } else {
            // 🌍 GLOBAL CHAT (default)
            messageData.chatType = 'global';
            messageData.chatId = 'global';
            messageData.groupId = 'global';
            console.log('🌍 Global message');
        }

        // Create and save message
        const newMessage = new Message(messageData);
        await newMessage.save();
        
        // Populate user data before sending response
        await newMessage.populate('userId', 'name avatar');
        
        console.log('✅ Message saved:', {
            id: newMessage._id,
            chatType: newMessage.chatType,
            chatId: newMessage.chatId,
            message: newMessage.message.substring(0, 30)
        });
        
        res.status(201).json(newMessage);
        
    } catch (error) {
        console.error('❌ Send message error:', error);
        res.status(500).json({ error: 'Failed to send message: ' + error.message });
    }
});

// ---------- GROUP CHAT ROUTES (Enhanced) ----------
app.get('/api/chats/group', authMiddleware, async (req, res) => {
    try {
        const { groupId } = req.query;
        const filter = { 
            chatType: 'group',
            groupId: groupId || 'global'
        };
        
        const messages = await Message.find(filter)
            .sort({ timestamp: 1 })
            .populate('userId', 'name avatar')
            .limit(100);
            
        console.log(`👥 Group messages: ${messages.length} for group: ${groupId || 'global'}`);
        res.json(messages);
    } catch (error) {
        console.error('❌ Group messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chats/group', authMiddleware, async (req, res) => {
    try {
        const { message, groupId } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        const finalGroupId = groupId || 'global';

        const newMessage = new Message({
            userId: req.user._id,
            userName: req.user.name,
            message: message.trim(),
            chatType: 'group',
            chatId: finalGroupId,
            groupId: finalGroupId
        });

        await newMessage.save();
        await newMessage.populate('userId', 'name avatar');
        console.log(`👥 Group message saved to: ${finalGroupId}`);
        res.status(201).json(newMessage);
    } catch (error) {
        console.error('❌ Send group message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---------- PRIVATE CHAT ROUTES (Enhanced) ----------
app.get('/api/chats/private/:otherUserId', authMiddleware, async (req, res) => {
    try {
        const { otherUserId } = req.params;
        const privateChatId = [req.user._id.toString(), otherUserId].sort().join('_');

        const messages = await Message.find({ 
            chatType: 'private',
            privateChatId: privateChatId 
        })
        .sort({ timestamp: 1 })
        .populate('userId', 'name avatar')
        .limit(100);

        console.log(`🔒 Private messages with ${otherUserId}: ${messages.length}`);
        res.json(messages);
    } catch (error) {
        console.error('❌ Private messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chats/private/:otherUserId', authMiddleware, async (req, res) => {
    try {
        const { otherUserId } = req.params;
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        const privateChatId = [req.user._id.toString(), otherUserId].sort().join('_');

        const newMessage = new Message({
            userId: req.user._id,
            userName: req.user.name,
            message: message.trim(),
            chatType: 'private',
            chatId: privateChatId,
            privateChatId: privateChatId,
            targetUserId: otherUserId,
            receiverId: otherUserId,
            groupId: privateChatId
        });

        await newMessage.save();
        await newMessage.populate('userId', 'name avatar');
        console.log(`🔒 Private message saved to: ${otherUserId}, ChatId: ${privateChatId}`);
        res.status(201).json(newMessage);
    } catch (error) {
        console.error('❌ Send private message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---------- CLOUDINARY UPLOAD ROUTES ----------
app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        console.log('🔍 Upload request received');
        
        let fileBuffer, mimeType, fileName;
        
        if (req.file) {
            fileBuffer = req.file.buffer;
            mimeType = req.file.mimetype;
            fileName = req.file.originalname;
        } else if (req.body.file) {
            const base64Data = req.body.file;
            const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches) {
                mimeType = matches[1];
                fileBuffer = Buffer.from(matches[2], 'base64');
                fileName = req.body.filename || 'file.jpg';
            } else {
                fileBuffer = Buffer.from(base64Data, 'base64');
                mimeType = 'image/jpeg';
                fileName = 'file.jpg';
            }
        } else {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('📁 File received:', fileName);
        console.log('📊 File size:', fileBuffer.length);

        const base64 = fileBuffer.toString('base64');
        const dataURI = `data:${mimeType};base64,${base64}`;

        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'exambuddy',
            public_id: `file_${Date.now()}`,
            resource_type: 'auto'
        });

        console.log('☁️ Cloudinary upload successful:', result.public_id);

        res.json({
            message: 'File uploaded successfully',
            fileUrl: result.secure_url,
            publicId: result.public_id
        });
    } catch (error) {
        console.error('❌ Upload Error:', error);
        res.status(500).json({ 
            error: error.message || 'Upload failed',
            details: error.http_code ? `HTTP ${error.http_code}` : 'Unknown error'
        });
    }
});

app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const base64 = req.file.buffer.toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${base64}`;

        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'exambuddy/avatars',
            public_id: `avatar_${req.user._id}_${Date.now()}`,
            resource_type: 'image'
        });

        const user = await User.findById(req.user._id);
        
        if (user.avatarPublicId) {
            try {
                await cloudinary.uploader.destroy(user.avatarPublicId);
            } catch (e) {
                console.log('Could not delete old avatar:', e.message);
            }
        }

        user.avatar = result.secure_url;
        user.avatarPublicId = result.public_id;
        await user.save();

        res.json({ 
            message: 'Avatar updated successfully', 
            avatar: user.avatar 
        });
    } catch (error) {
        console.error('❌ Avatar Error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload avatar' });
    }
});

// ==================== TEMPORARY: CLEAR ALL MESSAGES (for testing) ====================
app.delete('/api/clear-messages', authMiddleware, async (req, res) => {
    try {
        // Optional: filter by chatType if provided
        const { chatType } = req.query;
        let filter = {};
        if (chatType) {
            filter.chatType = chatType;
        }
        
        const result = await Message.deleteMany(filter);
        res.json({ 
            message: 'Messages cleared successfully', 
            deletedCount: result.deletedCount,
            filter: filter
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== GLOBAL ERROR HANDLER ====================
app.use((err, req, res, next) => {
    console.error('❌ EXPRESS ERROR:', err);
    if (err instanceof Error) {
        console.error('MESSAGE:', err.message);
        console.error('STACK:', err.stack);
    }
    res.status(500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n============================');
    console.log('    EXAM BUDDY BACKEND READY!');
    console.log('============================');
    console.log(`    PORT: ${PORT}`);
    console.log(`    MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Not Connected'}`);
    console.log(`    Cloudinary: ${cloudinary.config().cloud_name ? '✅ Configured' : '❌ Not Configured'}`);
    console.log(`    CORS: ✅ All origins allowed`);
    console.log(`    Block Feature: ✅ Enabled`);
    console.log('');
    console.log('📡 API available at:');
    console.log(`   http://127.0.0.1:${PORT}/api/test`);
    console.log(`   http://localhost:${PORT}/api/test`);
    console.log('');
    console.log('🔒 Block API Endpoints:');
    console.log(`   POST   /api/blocks           - Block a user`);
    console.log(`   DELETE /api/blocks/:id       - Unblock a user`);
    console.log(`   GET    /api/blocks           - Get all blocked users`);
    console.log(`   GET    /api/blocks/:id/check - Check if user is blocked`);
    console.log('');
});
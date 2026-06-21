require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

// ==================== SECURITY: BLOCK SENSITIVE FILES ====================
app.use((req, res, next) => {
  const blockedPaths = ['.env', '.git', 'package.json', 'package-lock.json'];
  if (blockedPaths.some(p => req.path.includes(p))) {
    console.log(`🛡️ Blocked access to: ${req.path}`);
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
});

// ==================== MIDDLEWARE ====================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).send('OK');
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== REQUEST LOGGER ====================
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.originalUrl}`);
  next();
});

// ==================== GLOBAL PROCESS ERROR HANDLING ====================
process.on('uncaughtException', (err) => {
  console.error('\n❌ UNCAUGHT EXCEPTION');
  console.error(err);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ UNHANDLED REJECTION');
  console.error(reason);
  if (reason instanceof Error) {
    console.error(reason.stack);
  }
});

// ==================== CLOUDINARY CONFIG ====================
console.log('☁️ Configuring Cloudinary...');
console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ NOT SET');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ==================== MULTER CONFIG ====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'), false);
    }
  }
});

// ==================== MONGODB CONNECTION ====================
console.log('Checking MONGODB_URI:', process.env.MONGODB_URI ? '✅ SET' : '❌ NOT SET');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB Connected successfully!');
})
.catch(err => {
  console.error('\n❌ MongoDB Connection Error');
  console.error(err);
  console.error(err.stack);
});

// ==================== MODELS ====================

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

const examSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examName: { type: String, required: true },
  examDate: { type: String, required: true },
  examCity: { type: String, required: true },
  examCenter: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Exam = mongoose.model('Exam', examSchema);

// ==================== UPDATED MESSAGE SCHEMA ====================
const messageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  message: { type: String, required: true },
  messageType: { type: String, enum: ['text', 'image', 'file', 'location'], default: 'text' },
  fileUrl: { type: String },
  filePublicId: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  // NEW: Chat type fields to separate group and private messages
  chatType: { type: String, enum: ['global', 'group', 'private'], default: 'global' },
  groupId: { type: String, default: 'global' },
  privateChatId: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// Add indexes for better performance
messageSchema.index({ chatType: 1, groupId: 1 });
messageSchema.index({ chatType: 1, privateChatId: 1 });
messageSchema.index({ timestamp: -1 });

const Message = mongoose.model('Message', messageSchema);

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
    console.error('\n❌ Auth Error');
    console.error(error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== API ROUTES ====================

app.get('/', (req, res) => {
  res.send('ExamBuddy API is running!');
});

app.get('/api/routes', (req, res) => {
  try {
    const routes = [];
    app._router.stack.forEach(middleware => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
        routes.push(`${methods} ${middleware.route.path}`);
      }
    });
    res.json({ message: 'All registered routes', routes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cloudinary-status', (req, res) => {
  res.json({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing',
    api_key: process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Missing',
    api_secret: process.env.CLOUDINARY_API_SECRET ? '✅ Set' : '❌ Missing'
  });
});

// ---------- AUTH ROUTES ----------
app.post('/api/auth/register', async (req, res) => {
  try {
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

    res.status(201).json({ user, token, isNew: true });
  } catch (error) {
    console.error('\n❌ Register Error');
    console.error(error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- CLOUDINARY UPLOAD ----------
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
        fileName = req.body.filename || 'image.jpg';
      } else {
        fileBuffer = Buffer.from(base64Data, 'base64');
        mimeType = 'image/jpeg';
        fileName = 'image.jpg';
      }
    } else {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📁 File received:', fileName);
    console.log('📊 File size:', fileBuffer.length);
    console.log('📊 MIME type:', mimeType);

    const base64 = fileBuffer.toString('base64');
    const dataURI = `data:${mimeType};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'exambuddy',
      public_id: `exam_${Date.now()}`,
      resource_type: 'image'
    });

    console.log('☁️ Cloudinary upload successful:', result.public_id);

    res.json({
      message: 'File uploaded successfully',
      fileUrl: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    console.error('\n❌ Upload Error');
    console.error(error);
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
    console.error('\n❌ Avatar Error');
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload avatar' });
  }
});

app.post('/api/chats/:groupId/upload', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const base64 = req.file.buffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'exambuddy/chats',
      public_id: `chat_${req.params.groupId}_${Date.now()}`,
      resource_type: 'image'
    });

    const newMessage = new Message({
      userId: req.user._id,
      userName: req.user.name,
      message: '📷 Image',
      messageType: 'image',
      fileUrl: result.secure_url,
      filePublicId: result.public_id,
      chatType: 'group',
      groupId: req.params.groupId || 'global'
    });

    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('\n❌ Chat Upload Error');
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload image' });
  }
});

app.post('/api/upload-simple', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      message: 'File uploaded successfully (simple)',
      file: {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('\n❌ Simple Upload Error');
    console.error(error);
    res.status(500).json({ error: error.message || 'Simple upload failed' });
  }
});

// ==================== FIXED MESSAGES ROUTES ====================

// GET MESSAGES - Supports global, group, and private chats
app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { type, userId, groupId } = req.query;
    let filter = {};
    
    if (type === 'private' && userId) {
      // Private chat between current user and specified user
      const privateChatId = [req.user._id.toString(), userId].sort().join('_');
      filter = { 
        chatType: 'private',
        privateChatId: privateChatId
      };
      console.log(`🔒 Fetching private chat: ${privateChatId}`);
    } else if (type === 'group') {
      // Group chat
      filter = { 
        chatType: 'group',
        groupId: groupId || 'global'
      };
      console.log(`👥 Fetching group chat: ${groupId || 'global'}`);
    } else {
      // Default: global chat (all messages)
      filter = { chatType: 'global' };
      console.log('🌍 Fetching global chat');
    }

    const messages = await Message.find(filter)
      .sort({ timestamp: 1 })
      .limit(100)
      .populate('userId', 'name avatar');
    
    console.log(`📨 Sending ${messages.length} messages`);
    res.json(messages);
  } catch (error) {
    console.error('❌ Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// POST MESSAGE - Supports global, group, and private chats
app.post('/api/messages', authMiddleware, async (req, res) => {
  try {
    console.log('📨 Message received:', req.body);
    
    const { user, content, type, chatType, targetUserId, groupId } = req.body;

    // ===== FIX: Proper validation for user and content =====
    if (!user) {
      return res.status(400).json({ error: 'User is required' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Build message object
    const messageData = {
      userId: req.user._id,
      userName: user,
      message: content.trim(),
      messageType: type || 'text',
      timestamp: new Date()
    };

    // Handle different chat types
    if (chatType === 'private' && targetUserId) {
      // Private message
      const privateChatId = [req.user._id.toString(), targetUserId].sort().join('_');
      messageData.chatType = 'private';
      messageData.privateChatId = privateChatId;
      messageData.groupId = privateChatId;
      console.log(`🔒 Private message to: ${targetUserId}`);
    } else if (chatType === 'group') {
      // Group message
      messageData.chatType = 'group';
      messageData.groupId = groupId || 'global';
      console.log(`👥 Group message in: ${groupId || 'global'}`);
    } else {
      // Default: global chat
      messageData.chatType = 'global';
      messageData.groupId = 'global';
      console.log('🌍 Global message');
    }

    const newMessage = new Message(messageData);
    await newMessage.save();
    
    // Populate user data before sending response
    await newMessage.populate('userId', 'name avatar');
    
    console.log('✅ Message saved:', newMessage._id, 'Type:', messageData.chatType);
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('❌ Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ==================== GROUP CHAT SPECIFIC ROUTES ====================
app.get('/api/chats/group', authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({ chatType: 'group' })
      .sort({ timestamp: 1 })
      .populate('userId', 'name avatar')
      .limit(100);
    res.json(messages);
  } catch (error) {
    console.error('❌ Group messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chats/group', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const newMessage = new Message({
      userId: req.user._id,
      userName: req.user.name,
      message: message.trim(),
      chatType: 'group',
      groupId: 'global'
    });

    await newMessage.save();
    await newMessage.populate('userId', 'name avatar');
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('❌ Send group message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== PRIVATE CHAT SPECIFIC ROUTES ====================
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
      privateChatId: privateChatId,
      groupId: privateChatId
    });

    await newMessage.save();
    await newMessage.populate('userId', 'name avatar');
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('❌ Send private message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== EXAM ROUTES ====================
app.get('/api/exams', authMiddleware, async (req, res) => {
  try {
    const exams = await Exam.find().sort({ createdAt: -1 });
    console.log('📚 Sending all exams:', exams.length);
    res.json(exams);
  } catch (error) {
    console.error('❌ Get exams error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/exams', authMiddleware, async (req, res) => {
  try {
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
    res.status(201).json(exam);
  } catch (error) {
    console.error('\n❌ Create Exam Error');
    console.error(error);
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
    console.error('\n❌ Delete Exam Error');
    console.error(error);
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
    console.error('\n❌ Matches Error');
    console.error(error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// ---------- STATS ROUTE ----------
app.get('/api/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalExams = await Exam.countDocuments();
    const totalMessages = await Message.countDocuments();

    res.json({
      totalUsers,
      totalExams,
      totalMessages,
      mongodb: 'connected'
    });
  } catch (error) {
    console.error('\n❌ Stats Error');
    console.error(error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// ==================== GLOBAL EXPRESS ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('\n❌ EXPRESS ERROR');
  console.error(err);
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
  console.log(`    http://0.0.0.0:${PORT}`);
  console.log(`    Cloudinary: ${cloudinary.config().cloud_name ? 'Configured' : 'Not Configured'}`);
  console.log(`    MongoDB: Connected ✅`);
  console.log('');
});
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());

// ==================== CLOUDINARY CONFIG ====================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'exambuddy',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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
  console.error('❌ MongoDB connection error:', err.message);
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

// Message Schema
const messageSchema = new mongoose.Schema({
  groupId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  message: { type: String, required: true },
  messageType: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
  fileUrl: { type: String },
  filePublicId: { type: String },
  timestamp: { type: Date, default: Date.now }
});

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
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== API ROUTES ====================

// ---------- HOME ROUTE ----------
app.get('/', (req, res) => {
  res.send('ExamBuddy API is running!');
});

// ---------- DEBUG ROUTES ----------
app.get('/api/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      routes.push(`${methods} ${middleware.route.path}`);
    }
  });
  res.json({
    message: 'All registered routes',
    routes: routes
  });
});

app.get('/api/cloudinary-status', (req, res) => {
  res.json({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing',
    api_key: process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Missing',
    api_secret: process.env.CLOUDINARY_API_SECRET ? '✅ Set' : '❌ Missing'
  });
});

// ---------- TEST ROUTES (NO CLOUDINARY) ----------
app.post('/api/upload-test', authMiddleware, async (req, res) => {
  try {
    console.log('🔍 Upload test endpoint hit');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ 
        error: 'No data received',
        message: 'Please send a multipart/form-data request with a file'
      });
    }

    res.json({
      message: 'Upload test successful!',
      received: {
        body: req.body,
        headers: {
          authorization: req.headers.authorization ? '✅ Present' : '❌ Missing'
        }
      }
    });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ 
      error: 'Test failed', 
      message: error.message 
    });
  }
});

app.post('/api/upload-multer', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    console.log('🔍 Multer test endpoint hit');
    console.log('File:', req.file);
    console.log('Body:', req.body);
    
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        debug: { 
          hasFile: false,
          contentType: req.headers['content-type']
        }
      });
    }

    res.json({
      message: 'Multer test successful!',
      file: {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path || 'No path available'
      }
    });
  } catch (error) {
    console.error('Multer test error:', error);
    res.status(500).json({ 
      error: 'Multer test failed', 
      message: error.message,
      stack: error.stack 
    });
  }
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
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

// ---------- USER AVATAR UPLOAD ----------
app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    
    if (user.avatarPublicId) {
      await cloudinary.uploader.destroy(user.avatarPublicId);
    }

    user.avatar = req.file.path;
    user.avatarPublicId = req.file.filename;
    await user.save();

    res.json({ 
      message: 'Avatar updated successfully', 
      avatar: user.avatar 
    });
  } catch (error) {
    console.error('Avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// ---------- EXAM ROUTES ----------
app.get('/api/exams', authMiddleware, async (req, res) => {
  try {
    const exams = await Exam.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(exams);
  } catch (error) {
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
    res.status(500).json({ error: 'Server error' });
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
    res.status(500).json({ error: 'Server error' });
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
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- CHAT ROUTES ----------
app.get('/api/chats/:groupId', authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({ groupId: req.params.groupId })
      .sort({ timestamp: 1 })
      .limit(100);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/chats/:groupId', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const newMessage = new Message({
      groupId: req.params.groupId,
      userId: req.user._id,
      userName: req.user.name,
      message: message.trim()
    });

    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- CHAT IMAGE UPLOAD ----------
app.post('/api/chats/:groupId/upload', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const newMessage = new Message({
      groupId: req.params.groupId,
      userId: req.user._id,
      userName: req.user.name,
      message: '📷 Image',
      messageType: 'image',
      fileUrl: req.file.path,
      filePublicId: req.file.filename
    });

    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// ---------- GENERAL UPLOAD ROUTE ----------
app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      message: 'File uploaded successfully',
      fileUrl: req.file.path,
      publicId: req.file.filename
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ---------- TRAVEL PLAN ROUTES ----------
app.get('/api/travel-plans/exam/:examId', authMiddleware, async (req, res) => {
  try {
    const travelPlans = await TravelPlan.find({ examId: req.params.examId })
      .populate('createdBy', 'name mobile avatar')
      .populate('participants', 'name mobile avatar');
    res.json(travelPlans);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/travel-plans', authMiddleware, async (req, res) => {
  try {
    const { examId, travelMode, departureTime, departureLocation, contactInfo, notes } = req.body;

    if (!examId || !travelMode) {
      return res.status(400).json({ error: 'Exam ID and travel mode are required' });
    }

    const exam = await Exam.findOne({ _id: examId, userId: req.user._id });
    if (!exam) {
      return res.status(403).json({ error: 'You can only create travel plans for your own exams' });
    }

    const travelPlan = new TravelPlan({
      examId,
      createdBy: req.user._id,
      travelMode,
      departureTime,
      departureLocation,
      contactInfo,
      notes,
      participants: [req.user._id]
    });

    await travelPlan.save();
    await travelPlan.populate('createdBy', 'name mobile avatar');

    res.status(201).json(travelPlan);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/travel-plans/:planId/join', authMiddleware, async (req, res) => {
  try {
    const travelPlan = await TravelPlan.findById(req.params.planId);
    if (!travelPlan) {
      return res.status(404).json({ error: 'Travel plan not found' });
    }

    if (!travelPlan.participants.includes(req.user._id)) {
      travelPlan.participants.push(req.user._id);
      await travelPlan.save();
    }

    await travelPlan.populate('participants', 'name mobile avatar');
    res.json(travelPlan);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
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
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- TEST ROUTE ----------
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n============================');
  console.log('    EXAM BUDDY BACKEND READY!');
  console.log('============================');
  console.log(`    http://0.0.0.0:${PORT}`);
  console.log(`    http://0.0.0.0:${PORT}/api/upload`);
  console.log(`    Cloudinary: ${cloudinary.config().cloud_name ? 'Configured' : 'Not Configured'}`);
  console.log(`    MongoDB: Connected ✅`);
  console.log('');
});
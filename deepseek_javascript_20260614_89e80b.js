// ExamBuddy Backend Server - No MongoDB Required!
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ========== IN-MEMORY DATABASE ==========
let users = [];
let exams = [];
let messages = [];
let travelPlans = [];
let nextId = 1;

// Generate simple auth token
function generateToken(user) {
    return Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
}

// Get user from token
function getUserFromToken(req) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;
    
    try {
        const userId = parseInt(Buffer.from(token, 'base64').toString().split(':')[0]);
        return users.find(u => u.id === userId);
    } catch (error) {
        return null;
    }
}

// ========== API ROUTES ==========

// Health check
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 ExamBuddy API is running!',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth/register',
            exams: '/api/exams',
            matches: '/api/matches',
            chats: '/api/chats/:groupId',
            stats: '/api/stats'
        }
    });
});

// Register/Login user
app.post('/api/auth/register', (req, res) => {
    const { mobile, name, gender, homeCity } = req.body;
    
    // Validation
    if (!mobile || !name || !homeCity) {
        return res.status(400).json({ error: 'Please fill all required fields' });
    }
    if (!/^\d{10}$/.test(mobile)) {
        return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
    }
    
    // Check if user exists
    let user = users.find(u => u.mobile === mobile);
    
    if (user) {
        const token = generateToken(user);
        return res.json({ user, token, isNew: false });
    }
    
    // Create new user
    user = {
        id: nextId++,
        mobile,
        name,
        gender: gender || 'Other',
        homeCity,
        verified: true,
        avatar: name.charAt(0).toUpperCase(),
        createdAt: new Date().toISOString()
    };
    
    users.push(user);
    const token = generateToken(user);
    
    res.status(201).json({ user, token, isNew: true });
});

// Get current user
app.get('/api/auth/me', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ user });
});

// Get all users (for testing)
app.get('/api/users', (req, res) => {
    const usersList = users.map(u => ({
        id: u.id,
        name: u.name,
        homeCity: u.homeCity,
        avatar: u.avatar
    }));
    res.json(usersList);
});

// Get user's exams
app.get('/api/exams', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const userExams = exams.filter(e => e.userId === user.id);
    res.json(userExams);
});

// Add new exam
app.post('/api/exams', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { examName, examDate, examCity, examCenter } = req.body;
    
    if (!examName || !examDate || !examCity) {
        return res.status(400).json({ error: 'Please fill all required fields' });
    }
    
    const exam = {
        id: nextId++,
        userId: user.id,
        examName,
        examDate,
        examCity,
        examCenter: examCenter || '',
        createdAt: new Date().toISOString()
    };
    
    exams.push(exam);
    res.status(201).json(exam);
});

// Delete exam
app.delete('/api/exams/:id', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const examId = parseInt(req.params.id);
    const examIndex = exams.findIndex(e => e.id === examId && e.userId === user.id);
    
    if (examIndex === -1) {
        return res.status(404).json({ error: 'Exam not found' });
    }
    
    exams.splice(examIndex, 1);
    res.json({ message: 'Exam deleted successfully' });
});

// Find travel buddies
app.get('/api/matches', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const userExams = exams.filter(e => e.userId === user.id);
    
    if (userExams.length === 0) {
        return res.json([]);
    }
    
    const matches = [];
    
    for (const exam of userExams) {
        const matchingExams = exams.filter(e => 
            e.id !== exam.id &&
            e.examName === exam.examName &&
            e.examDate === exam.examDate &&
            e.examCity === exam.examCity
        );
        
        for (const matchingExam of matchingExams) {
            const buddy = users.find(u => u.id === matchingExam.userId);
            if (buddy && buddy.id !== user.id) {
                const exists = matches.some(m => 
                    m.buddy.id === buddy.id && m.exam.id === exam.id
                );
                
                if (!exists) {
                    matches.push({
                        exam: {
                            id: exam.id,
                            examName: exam.examName,
                            examDate: exam.examDate,
                            examCity: exam.examCity,
                            examCenter: exam.examCenter
                        },
                        buddy: {
                            id: buddy.id,
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
    }
    
    res.json(matches);
});

// Get chat messages
app.get('/api/chats/:groupId', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const groupMessages = messages
        .filter(m => m.groupId === req.params.groupId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    res.json(groupMessages);
});

// Send chat message
app.post('/api/chats/:groupId', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { message } = req.body;
    
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }
    
    const newMessage = {
        id: nextId++,
        groupId: req.params.groupId,
        userId: user.id,
        userName: user.name,
        message: message.trim(),
        timestamp: new Date().toISOString()
    };
    
    messages.push(newMessage);
    res.status(201).json(newMessage);
});

// Get travel plans for an exam
app.get('/api/travel-plans/exam/:examId', (req, res) => {
    const plans = travelPlans.filter(p => p.examId === parseInt(req.params.examId));
    res.json(plans);
});

// Create travel plan
app.post('/api/travel-plans', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { examId, travelMode, departureTime, departureLocation, contactInfo, notes } = req.body;
    
    const travelPlan = {
        id: nextId++,
        examId: parseInt(examId),
        createdBy: user.id,
        createdByName: user.name,
        travelMode: travelMode || 'Train',
        departureTime: departureTime || '',
        departureLocation: departureLocation || '',
        contactInfo: contactInfo || '',
        notes: notes || '',
        participants: [user.id],
        participantNames: [user.name],
        createdAt: new Date().toISOString()
    };
    
    travelPlans.push(travelPlan);
    res.status(201).json(travelPlan);
});

// Join travel plan
app.post('/api/travel-plans/:planId/join', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const planId = parseInt(req.params.planId);
    const plan = travelPlans.find(p => p.id === planId);
    
    if (!plan) {
        return res.status(404).json({ error: 'Travel plan not found' });
    }
    
    if (!plan.participants.includes(user.id)) {
        plan.participants.push(user.id);
        plan.participantNames.push(user.name);
    }
    
    res.json(plan);
});

// Get platform statistics
app.get('/api/stats', (req, res) => {
    // Calculate unique matches
    const matchGroups = new Set();
    exams.forEach(exam => {
        const key = `${exam.examName}-${exam.examDate}-${exam.examCity}`;
        matchGroups.add(key);
    });
    
    res.json({
        totalUsers: users.length,
        totalExams: exams.length,
        totalMessages: messages.length,
        totalTravelPlans: travelPlans.length,
        totalMatches: matchGroups.size,
        activeToday: Math.floor(Math.random() * 100) + 50 // Demo stats
    });
});

// Debug endpoint (for testing)
app.get('/api/debug', (req, res) => {
    res.json({
        users: users.map(u => ({ id: u.id, name: u.name, mobile: u.mobile, homeCity: u.homeCity })),
        exams: exams,
        messages: messages.length,
        travelPlans: travelPlans.length
    });
});

// Clear all data (for testing)
app.delete('/api/debug/clear', (req, res) => {
    users = [];
    exams = [];
    messages = [];
    travelPlans = [];
    nextId = 1;
    res.json({ message: 'All data cleared!' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('\n🚀 =====================================');
    console.log('   ExamBuddy Server is Running!');
    console.log('   =====================================\n');
    console.log(`   📍 Server URL: http://localhost:${PORT}`);
    console.log(`   📡 API Base:   http://localhost:${PORT}/api`);
    console.log(`   📊 Stats:      http://localhost:${PORT}/api/stats\n`);
    console.log('   📋 Available Endpoints:');
    console.log('   ─────────────────────────────────────');
    console.log('   POST   /api/auth/register  - Register/Login');
    console.log('   GET    /api/exams          - Get your exams');
    console.log('   POST   /api/exams          - Add new exam');
    console.log('   DELETE /api/exams/:id      - Delete exam');
    console.log('   GET    /api/matches        - Find travel buddies');
    console.log('   GET    /api/chats/:groupId - Get messages');
    console.log('   POST   /api/chats/:groupId - Send message');
    console.log('   GET    /api/travel-plans/exam/:examId');
    console.log('   POST   /api/travel-plans   - Create travel plan');
    console.log('   POST   /api/travel-plans/:planId/join');
    console.log('   GET    /api/users          - List all users');
    console.log('   GET    /api/stats          - Platform stats');
    console.log('   GET    /api/debug          - Debug info');
    console.log('   ─────────────────────────────────────\n');
});
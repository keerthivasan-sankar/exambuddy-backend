const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('✅ ExamBuddy API is running!');
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is healthy!' });
});

app.get('/api/stats', (req, res) => {
    res.json({ users: 0, messages: 0 });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
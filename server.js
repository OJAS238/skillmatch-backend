import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import quizRoutes from './routes/quiz.js';
import leaderboardRoutes from './routes/leaderboard.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// 1. CORS Configuration
const corsOptions = {
  origin: [
    'http://localhost:3003',
    'http://192.168.29.142:3003',
    'http://localhost:3000',
    'http://192.168.29.142:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// 2. Body Parser Middleware
app.use(express.json());

// 3. Database Connection
const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.error('FATAL ERROR: MONGODB_URI environment variable is missing.');
  process.exit(1);
}

mongoose
  .connect(mongoURI)
  .then(() => console.log('Successfully connected to MongoDB Atlas.'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// 4. REST API Routes Mapping
app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// ==========================================
// TEMPORARY HACKATHON TEST ROUTE (Step 1.1)
// ==========================================
app.get('/api/test-db', async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('test_connections');
    const result = await collection.insertOne({ 
      message: "SkillMatch backend successfully wrote to Atlas!", 
      timestamp: new Date(),
      status: "Verified End-to-End"
    });
    res.json({ 
      success: true, 
      message: "Database write successful!", 
      insertedId: result.insertedId 
    });
  } catch (error) {
    next(error);
  }
});

// 5. Global Error Handler Middleware (Must be below routes)
app.use((err, req, res, next) => {
  console.error("🚨 CRITICAL BACKEND ERROR:", err);
  res.status(500).json({
    success: false,
    message: 'An internal server error occurred.',
    error: err.message,
  });
});

// Start listening
app.listen(PORT, () => {
  console.log(`SkillMatch API server listening on port ${PORT}`);
});

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Helper: Sign JWT Token
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_me';
  return jwt.sign({ id: userId }, secret, { expiresIn: '30d' });
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user account
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Simple validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (name, email, password).',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // Hash the password with Salt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
    });
    await newUser.save();

    // Sign authentication token
    const token = generateToken(newUser._id);

    return res.status(201).json({
      success: true,
      token,
      user: newUser,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during user registration.',
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Validate credentials and log in
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Simple validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password fields.',
      });
    }

    // Find the user profile (include hidden password field for verification)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email address or password combination.',
      });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email address or password combination.',
      });
    }

    // Sign new session authentication token
    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during user validation.',
    });
  }
});

/**
 * @route   POST /api/auth/name-login
 * @desc    Hackathon-simplified auth: find the user by name, or create one if
 *          they don't exist yet. No email/password required.
 * @access  Public
 */
router.post('/name-login', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a name.',
      });
    }

    const cleanName = name.trim();
    // Escape regex special characters so names like "O'Brien" don't break the query
    const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Case-insensitive match so "alex" and "Alex" resolve to the same profile
    let user = await User.findOne({ name: { $regex: `^${escaped}$`, $options: 'i' } });

    let isNewUser = false;
    if (!user) {
      user = new User({ name: cleanName });
      await user.save();
      isNewUser = true;
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      isNewUser,
      token,
      user,
    });
  } catch (error) {
    console.error('Name-login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during name-based login.',
    });
  }
});

/**
 * @route   GET /api/auth/user/:id
 * @desc    Fetch a single user's profile/stats by their Mongo ID
 * @access  Public
 */
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, user });
  } catch (error) {
    console.error('Fetch user error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching user.' });
  }
});

export default router;
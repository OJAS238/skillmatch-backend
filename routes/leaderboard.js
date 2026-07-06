import express from 'express';
import User from '../models/User.js';

const router = express.Router();

/**
 * @route   GET /api/leaderboard
 * @desc    Get top users ranked by XP
 * @access  Public (for hackathon simplicity)
 */
router.get('/', async (req, res) => {
  try {
    const topUsers = await User.find()
      .select('name xp streak rank learningStyle')
      .sort({ xp: -1 })
      .limit(10);

    res.json({
      success: true,
      leaderboard: topUsers,
    });
  } catch (error) {
    console.error('Leaderboard fetch error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leaderboard.',
    });
  }
});

/**
 * @route   GET /api/leaderboard/rank/:userId
 * @desc    Get a single user's real rank position + percentile among all users, by xp
 * @access  Public
 */
router.get('/rank/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const totalUsers = await User.countDocuments();
    const usersAhead = await User.countDocuments({ xp: { $gt: user.xp } });
    const rankPosition = usersAhead + 1;
    const percentile = totalUsers > 0 ? Math.max(1, Math.round((rankPosition / totalUsers) * 100)) : 100;

    res.json({
      success: true,
      rankPosition,
      totalUsers,
      percentile, // e.g. 3 means "top 3%"
    });
  } catch (error) {
    console.error('Rank fetch error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching rank.',
    });
  }
});

export default router;
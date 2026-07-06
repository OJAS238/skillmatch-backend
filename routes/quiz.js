import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Turns raw form values like "backend" or "ui design" into "Backend" / "Ui Design"
// so the topic reads correctly wherever it's displayed across the app.
function capitalizeWords(str) {
  if (!str) return str;
  return str
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Using Groq's free API (Llama 3.3 70B) - no card required, and avoids Gemini's current project-access issue

// POST /api/quiz/generate
router.post('/generate', async (req, res, next) => {
  try {
    const { userId, topic, answers, learningStyle, pacingPreference } = req.body;

    if (!userId || !topic || !learningStyle) {
      return res.status(400).json({ success: false, message: 'Missing required payload data.' });
    }

    const systemPrompt = `You are an expert educational designer building a gamified learning path.
You must return ONLY a valid JSON object -- no markdown fences, no commentary, no extra text.
The JSON must match this exact shape:

{
  "learningArchetype": "A short, stylized label for this learner (e.g. 'Aural Listener', 'Visual Architect')",
  "targetTrajectory": "A short aspirational goal label (e.g. 'Engineering Craft Mastery')",
  "pacingLabel": "A short label combining their time commitment and a verdict (e.g. '45 Mins / Day (Optimal)')",
  "milestones": [
    { "title": "Milestone 1: ...", "description": "One sentence, tailored to their learning style." },
    { "title": "Milestone 2: ...", "description": "One sentence." },
    { "title": "Milestone 3: ...", "description": "One sentence." }
  ],
  "modules": [
    {
      "id": "m1",
      "title": "Module title",
      "description": "1-2 sentences tailored to a ${learningStyle} learner",
      "estimatedTime": "e.g. 45 mins",
      "xp": 50,
      "status": "unlocked"
    }
  ]
}

Rules:
- Provide exactly 3 milestones.
- Provide 5-6 modules, ordered by difficulty.
- The first module's status must be "unlocked", all others must be "locked".
- xp should increase gradually across modules (e.g. 50, 75, 100, 125, 150).
- Keep every string concise -- this renders in a compact UI card, not a document.`;

    const userPrompt = `Generate a personalized learning path for a student who wants to learn "${topic}".
Their learning style is "${learningStyle}".
Their time commitment preference is "${pacingPreference || 'not specified'}".
Additional quiz context: ${JSON.stringify(answers || {})}`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('🚨 Groq API error:', aiResponse.status, errText);
      return res.status(502).json({
        success: false,
        message: 'The AI generation service returned an error.',
      });
    }

    const data = await aiResponse.json();
    let rawContent = data.choices?.[0]?.message?.content?.trim();

    if (!rawContent) {
      return res.status(502).json({
        success: false,
        message: 'The AI service returned an empty response.',
      });
    }

    // Defensive cleanup in case the model wraps output in markdown fences anyway
    if (rawContent.startsWith('```json')) {
      rawContent = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let curriculumData;
    try {
      curriculumData = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('🚨 Failed to parse AI JSON:', rawContent);
      return res.status(502).json({
        success: false,
        message: 'The AI response could not be parsed. Please try again.',
      });
    }

    curriculumData.topic = capitalizeWords(topic);
    curriculumData.generatedAt = new Date();

    // Save to the User document (field now exists in the schema)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        learningStyle,
        learningPath: curriculumData,
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found in database.' });
    }

    return res.json({
      success: true,
      message: 'Curriculum generated and saved successfully!',
      curriculum: updatedUser.learningPath,
    });
  } catch (error) {
    console.error('🚨 QUIZ ROUTE INTERNAL CRASH:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during generation.',
      error: error.message,
    });
  }
});

// Rank tiers derived from total xp — recalculated every time xp changes
function computeRank(xp) {
  if (xp >= 2000) return 'Master Architect';
  if (xp >= 800) return 'Pro Architect';
  if (xp >= 300) return 'Adept';
  return 'Novice';
}

// Strip the time portion so we're comparing calendar days, not exact timestamps
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// POST /api/quiz/complete-lesson
// Called when a learner finishes a lesson's practice exercise. This is the
// one place in the whole app that actually awards xp / updates the streak /
// increments nodesVisited — everything else just displays these fields.
router.post('/complete-lesson', async (req, res) => {
  try {
    const { userId, xpEarned } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const today = startOfDay(new Date());
    let newStreak = user.streak;

    if (!user.lastActiveDate) {
      newStreak = 1;
    } else {
      const lastActive = startOfDay(user.lastActiveDate);
      const diffDays = Math.round((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // Already logged activity today — streak doesn't change
        newStreak = user.streak;
      } else if (diffDays === 1) {
        // Consecutive day — streak continues
        newStreak = user.streak + 1;
      } else {
        // Missed a day (or more) — streak resets
        newStreak = 1;
      }
    }

    const xpToAdd = typeof xpEarned === 'number' && xpEarned > 0 ? xpEarned : 50;
    const newXp = user.xp + xpToAdd;

    user.xp = newXp;
    user.rank = computeRank(newXp);
    user.streak = newStreak;
    user.nodesVisited = user.nodesVisited + 1;
    user.lastActiveDate = new Date();

    await user.save();

    return res.json({
      success: true,
      message: 'Lesson completion recorded.',
      user,
    });
  } catch (error) {
    console.error('🚨 Complete-lesson route crash:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error while recording lesson completion.',
      error: error.message,
    });
  }
});

// POST /api/quiz/lesson
// Generates real, tailored lesson content (headline, explainer, mentor quote,
// practice-panel copy, and a hint) for a single module — instead of reusing
// the same static "White Space" lesson for every node in the skill tree.
router.post('/lesson', async (req, res) => {
  try {
    const { moduleTitle, moduleDescription, topic, learningStyle } = req.body;

    if (!moduleTitle) {
      return res.status(400).json({ success: false, message: 'moduleTitle is required.' });
    }

    const systemPrompt = `You are an expert educational designer writing the content for ONE lesson screen in a gamified learning app.
You must return ONLY a valid JSON object -- no markdown fences, no commentary, no extra text.
The JSON must match this exact shape:

{
  "breadcrumb": "Short category label, e.g. 'UI Fundamentals'",
  "headlineLine1": "First half of a punchy 2-line title (e.g. 'The Power of')",
  "headlineLine2": "Second half of the title, the key concept itself (e.g. 'White Space')",
  "bodyText": "2-3 sentences teaching the core concept, tailored to a ${learningStyle || 'Visual'} learner",
  "mentorQuote": "One short, memorable quote-style sentence reinforcing the idea, no attribution needed",
  "practiceTitle": "Short title for a hands-on practice panel related to this concept (e.g. 'Layout Architect Tree')",
  "practiceDescription": "One sentence describing what the learner will practice",
  "hintText": "One short helpful hint for the practice exercise"
}

Keep every string concise -- this renders in a compact UI, not a document.`;

    const userPrompt = `Write the lesson content for the module titled "${moduleTitle}".
Module description/context: ${moduleDescription || 'No further context provided.'}
Overall course topic: ${topic || 'General skill development'}.`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('🚨 Groq API error (lesson):', aiResponse.status, errText);
      return res.status(502).json({
        success: false,
        message: 'The AI generation service returned an error.',
      });
    }

    const data = await aiResponse.json();
    let rawContent = data.choices?.[0]?.message?.content?.trim();

    if (!rawContent) {
      return res.status(502).json({
        success: false,
        message: 'The AI service returned an empty response.',
      });
    }

    if (rawContent.startsWith('```json')) {
      rawContent = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let lessonData;
    try {
      lessonData = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('🚨 Failed to parse AI lesson JSON:', rawContent);
      return res.status(502).json({
        success: false,
        message: 'The AI response could not be parsed. Please try again.',
      });
    }

    return res.json({ success: true, lesson: lessonData });
  } catch (error) {
    console.error('🚨 LESSON ROUTE INTERNAL CRASH:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during lesson generation.',
      error: error.message,
    });
  }
});

// GET /api/quiz/curriculum/:userId
router.get('/curriculum/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!user.learningPath) {
      return res.status(404).json({ success: false, message: 'No curriculum generated for this user yet.' });
    }

    res.json({
      success: true,
      curriculum: user.learningPath,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
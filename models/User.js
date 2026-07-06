import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // allows many users to have no email (name-only hackathon accounts)
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: false,
      minlength: [6, 'Password must be at least 6 characters long'],
    },
    streak: {
      type: Number,
      default: 0,
      min: 0,
    },
    xp: {
      type: Number,
      default: 0,
      min: 0,
    },
    rank: {
      type: String,
      default: 'Novice',
    },
    learningStyle: {
      type: String,
      default: 'Not Assessed',
    },
    nodesVisited: {
      type: Number,
      default: 0,
      min: 0,
    },
    focusTime: {
      type: Number,
      default: 0,
      min: 0,
    },
    learningPath: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastActiveDate: {
      type: Date,
      default: null,
    },
  },
  
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Prevent field leakage: ensure sensitive fields like password are never sent back by default
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

const User = mongoose.model('User', userSchema);
export default User;
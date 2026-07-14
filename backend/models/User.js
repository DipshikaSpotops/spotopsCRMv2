import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  team: {
    type: String,
    trim: true,
    required: false,
  },
  role: {
    type: String,
    enum: ['Admin', 'Sales', 'Support'],
    required: true,
  },
  permissions: {
    type: [String],
    default: [],
  },
  /** Attendance sheet + authorization codes roster (auto true for Sales/Support). */
  onAttendanceRoster: { type: Boolean, required: false },
  /** When APP_ACCESS_GATE_ENABLED=true, must redeem email-bound invite unless grandfathered/bypassed. */
  appAccessUnlocked: { type: Boolean, required: false },
}, { timestamps: true });

// Hash password before save (Mongoose 7+ async hooks do not take `next`)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema,'loggedInUsers');
export default User;

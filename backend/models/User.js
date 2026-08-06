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

/** Sales (and Admin) must never belong to an ops team. */
function stripTeamForNonOpsRoles(doc) {
  const role = String(doc?.role || '').trim();
  if (role === 'Sales' || role === 'Admin') {
    doc.team = undefined;
  }
}

userSchema.pre('validate', function () {
  stripTeamForNonOpsRoles(this);
});

userSchema.pre('save', function () {
  stripTeamForNonOpsRoles(this);
});

userSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() || {};
  const $set = update.$set || update;
  const role = String($set.role || this.getQuery()?.role || '').trim();
  // When role is Sales/Admin in the update, always unset team.
  if (role === 'Sales' || role === 'Admin') {
    if (!update.$unset) update.$unset = {};
    update.$unset.team = '';
    if (update.$set) delete update.$set.team;
    else if (update.team !== undefined) delete update.team;
    this.setUpdate(update);
  }
});

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

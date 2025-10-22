import mongoose from 'mongoose';

const loggedInUserSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    jwtToken: {
      type: String,
      required: true,
    },
    userAgent: String,
    ipAddress: String,
  },
  { timestamps: true } 
);


const LoggedInUser = mongoose.model('LoggedInUser', loggedInUserSchema);
export default LoggedInUser;

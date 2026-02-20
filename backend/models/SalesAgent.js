import mongoose from 'mongoose';

const salesAgentSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  brand: {
    type: String,
    required: true,
    enum: ['50STARS', 'PROLANE'],
    index: true
  }
}, {
  timestamps: true
});

// Compound index to ensure unique firstName per brand
salesAgentSchema.index({ firstName: 1, brand: 1 }, { unique: true });

export default mongoose.model("SalesAgent", salesAgentSchema);

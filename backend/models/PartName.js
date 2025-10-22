import mongoose from 'mongoose';
const partSchema = new mongoose.Schema({
  name: {
      type: String,
      required: true,
      unique: true, 
      trim: true
  }
});

export default mongoose.model("PartName", partSchema);
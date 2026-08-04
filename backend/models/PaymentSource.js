import mongoose from "mongoose";

const paymentSourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    showCardInfo: {
      type: Boolean,
      default: true,
    },
  },
  { collection: "paymentsources" }
);

export default mongoose.model("PaymentSource", paymentSourceSchema);

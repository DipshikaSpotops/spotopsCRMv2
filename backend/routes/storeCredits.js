import express from "express";
import Order from '../models/Order.js';
import { requireAuth, allow } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, allow('Admin', 'Sales', 'Support'), async (req, res) => {
  try {
    console.log("store credits");
    const orders = await Order.find({
      "additionalInfo.storeCredit": { $exists: true, $gt: 0 }
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching store credits:", error);
    res.status(500).json({ message: "Server error", error });
  }
});



export default router;

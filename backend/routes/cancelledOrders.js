// routes/cancelledOrders.js
import express from "express";
import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth, allow } from "../middleware/auth.js";

const router = express.Router();
const TZ = "America/Chicago";

function buildDateRange({ start, end, month, year }) {
  if (start && end) {
    const s = moment.tz(start, TZ).startOf("day");
    const e = moment.tz(end, TZ).endOf("day");
    return { startDate: s.toDate(), endExclusive: e.toDate() };
  }
  if (month && year) {
    const map = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    const m = isNaN(month) ? map[String(month).slice(0,3)] : Math.max(0, Math.min(11, Number(month) - 1));
    if (m == null) throw new Error("Invalid month");
    const startOfMonth = moment.tz({ year: Number(year), month: m, day: 1 }, TZ).startOf("month");
    const startOfNext  = startOfMonth.clone().add(1, "month");
    return { startDate: startOfMonth.toDate(), endExclusive: startOfNext.toDate() };
  }
  throw new Error("Provide either start/end or month/year");
}

router.get(
  "/",
  requireAuth,
  allow("Admin", "Sales", "Support"),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = "all",
        q,
        sortBy,
        sortOrder = "asc",
        salesAgent,
        start,
        end,
        month,
        year,
      } = req.query;

      const { startDate, endExclusive } = buildDateRange({ start, end, month, year });

      // Accept both "Order Cancelled" and "Cancelled"
      const statusOr = [{ orderStatus: "Order Cancelled" }, { orderStatus: "Cancelled" }];

      const query = {
        $and: [
          { $or: statusOr },
          { orderDate: { $gte: startDate, $lt: endExclusive } },
        ],
      };

      // Free-text search
      if (q && q.trim()) {
        const rx = new RegExp(q.trim(), "i");
        query.$and.push({
          $or: [
            { orderNo: rx }, { customerName: rx }, { fName: rx }, { lName: rx },
            { salesAgent: rx }, { phone: rx }, { email: rx }, { pReq: rx },
            { desc: rx }, { partNo: rx }, { make: rx }, { model: rx },
            { cancellationReason: rx },
            { additionalInfo: { $elemMatch: { yardName: rx } } },
            { additionalInfo: { $elemMatch: { status: rx } } },
            { additionalInfo: { $elemMatch: { trackingNo: rx } } },
          ]
        });
      }

      // RBAC
      if (req.user.role === "Sales") {
        query.$and.push({ salesAgent: new RegExp(`^${req.user.firstName}$`, "i") });
      } else if (req.user.role === "Admin" && salesAgent) {
        query.$and.push({ salesAgent: new RegExp(salesAgent.trim(), "i") });
      }

      const SORT_MAP = {
        orderDate: "orderDate",
        orderNo: "orderNo",
        pReq: "pReq",
        partName: "partName",
        salesAgent: "salesAgent",
        customerName: "customerName",
        yardName: "additionalInfo.0.yardName",
        cancelledBy: "cancelledBy",
        cancelledDate: "cancelledDate",
        cancellationReason: "cancellationReason",
        orderStatus: "orderStatus",
      };
      const dir = sortOrder === "desc" ? -1 : 1;

      // Include orderHistory so the client can extract "Cancelled By"
      const projectFields = {
        orderDate: 1, orderNo: 1, salesAgent: 1, customerName: 1, fName: 1, lName: 1,
        orderStatus: 1, pReq: 1, partName: 1, additionalInfo: 1,
        email: 1, phone: 1,
        cancelledBy: 1, cancelledDate: 1, cancellationReason: 1,
        orderHistory: 1,   // <-- this was missing
      };

      const Order = getOrderModelForBrand(req.brand);

      const totalOrders = await Order.countDocuments(query);

      if (sortBy === "customerName") {
        const pipeline = [
          { $match: query },
          {
            $addFields: {
              fullName: {
                $trim: {
                  input: {
                    $ifNull: [
                      "$customerName",
                      { $concat: [{ $ifNull: ["$fName", "" ] }, " ", { $ifNull: ["$lName", "" ] }] },
                    ],
                  },
                },
              },
            },
          },
          { $sort: { fullName: dir, _id: 1 } },
          ...(limit !== "all"
            ? [
                { $skip: (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10)) },
                { $limit: Math.max(1, parseInt(limit, 10)) },
              ]
            : []),
          { $project: projectFields }, // includes orderHistory
        ];
        const orders = await Order.aggregate(pipeline).collation({ locale: "en", strength: 2 });
        return res.json({
          totalOrders,
          currentPage: limit === "all" ? 1 : Math.max(1, parseInt(page, 10)),
          totalPages: limit === "all" ? 1 : Math.ceil(totalOrders / Math.max(1, parseInt(limit, 10))),
          orders,
        });
      }

      const sortSpec = SORT_MAP[sortBy]
        ? { [SORT_MAP[sortBy]]: dir, _id: 1 }
        : { orderDate: -1, _id: 1 };

      let cursor = Order.find(query, projectFields)
        .collation({ locale: "en", strength: 2 })
        .sort(sortSpec);

      if (limit !== "all") {
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));
        cursor = cursor.skip((pageNum - 1) * limitNum).limit(limitNum);
      }

      const orders = await cursor.lean();

      return res.json({
        totalOrders,
        currentPage: limit === "all" ? 1 : Math.max(1, parseInt(page, 10)),
        totalPages: limit === "all" ? 1 : Math.ceil(totalOrders / Math.max(1, parseInt(limit, 10))),
        orders,
      });
    } catch (err) {
      console.error("Error fetching cancelled orders:", err);
      const msg = err?.message?.includes("Provide either start/end")
        ? err.message
        : "Internal server error";
      return res.status(500).json({ message: msg });
    }
  }
);

export default router;

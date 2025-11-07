// /routes/monthlyOrders.js
import express from 'express';
import moment from 'moment-timezone';
import Order from '../models/Order.js';
import { requireAuth, allow } from '../middleware/auth.js';

const router = express.Router();
const TZ = 'America/Chicago';

// Utility: build date range from query
function buildDateRange(q) {
  const { start, end, month, year } = q;

  // Manual date range (calendar picker)
  if (start && end) {
    const startMoment = moment.tz(start, TZ).startOf("day");
    const endExclusiveMoment = moment.tz(end, TZ).endOf("day").add(1, "millisecond");

    return {
      startDate: startMoment.toDate(),
      endDate: endExclusiveMoment.toDate(),
      exclusiveEnd: true,
    };
  }

  // Month + year path
  if (month && year) {
    const monthIndex = isNaN(month)
      ? { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }[month]
      : parseInt(month, 10) - 1;

    const y = parseInt(year, 10);
    if (isNaN(monthIndex) || isNaN(y)) throw new Error("Invalid month/year");

    const startDateMoment = moment.tz({ year: y, month: monthIndex }, TZ).startOf("month");
    const endExclusiveMoment = startDateMoment.clone().add(1, "month");

    const startDate = startDateMoment.toDate();
    const endDate = endExclusiveMoment.toDate();

    console.log(" Final query range (DST-safe):", startDate, "to <", endDate);
    return { startDate, endDate, exclusiveEnd: true };
  }

  throw new Error("Provide either start/end or month/year");
}



// GET /orders/monthlyOrders  (secured)
router.get('/', requireAuth, allow('Admin', 'Sales', 'Support'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      q,
      sortBy,
      sortOrder = 'asc',
      salesAgent, // optional query param (Admin only)
      start,
      end,
      month,
      year,
    } = req.query;

    // 1) Date range
    const { startDate, endDate, exclusiveEnd } = buildDateRange({ start, end, month, year });
    console.log("Final query range (computed in route):", startDate, exclusiveEnd ? `to < ${endDate}` : endDate);
    // 2) Base query
    const query = {
      orderDate: exclusiveEnd
        ? { $gte: startDate, $lt: endDate }
        : { $gte: startDate, $lte: endDate },
    };

    // 3) Text search
    if (q && q.trim()) {
      const rx = new RegExp(q.trim(), 'i');
      const or = [
        { orderNo: rx }, { customerName: rx }, { fName: rx }, { lName: rx },
        { salesAgent: rx }, { phone: rx }, { email: rx }, { pReq: rx },
        { desc: rx }, { partNo: rx }, { make: rx }, { model: rx },
        { additionalInfo: { $elemMatch: { yardName: rx } } },
        { additionalInfo: { $elemMatch: { status: rx } } },
        { additionalInfo: { $elemMatch: { expShipDate: rx } } },
      ];
      const maybeNum = Number(q.trim());
      if (Number.isFinite(maybeNum)) {
        or.push({ year: maybeNum });
        or.push({ year: q.trim() }); // if stored as string
      }
      query.$or = or;
    }

    // 4) RBAC — enforce row-level access
    if (req.user.role === 'Sales') {
      // exact match (case-insensitive) against user's firstName
      query.salesAgent = new RegExp(`^${req.user.firstName}$`, 'i');
    } else if (req.user.role === 'Admin' && salesAgent) {
      // Admin can filter by any agent via query
      query.salesAgent = new RegExp(salesAgent.trim(), 'i');
    }
    // Support: no extra restriction (only date/search)

    // 5) Sorting
    const SORT_MAP = {
      orderDate: 'orderDate',
      orderNo: 'orderNo',
      pReq: 'pReq',
      salesAgent: 'salesAgent',
      customerName: 'customerName', // custom below
      yardName: 'additionalInfo.0.yardName',
      orderStatus: 'orderStatus',
    };
    const dir = sortOrder === 'desc' ? -1 : 1;

    // 6) Projection
    const projectFields = {
      orderDate: 1, orderNo: 1, salesAgent: 1, customerName: 1, fName: 1, lName: 1,
      soldP: 1, grossProfit: 1, actualGP: 1, orderStatus: 1, pReq: 1, additionalInfo: 1,
      email: 1, phone: 1, bAddressCity: 1, bAddressState: 1, bAddressZip: 1, bAddressStreet: 1,
      sAddressCity: 1, sAddressState: 1, sAddressZip: 1, sAddressStreet: 1, desc: 1, partNo: 1,
      warranty: 1, vin: 1, programmingRequired: 1, programmingCostQuoted: 1, year: 1, make: 1, model: 1,
    };

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const totalOrders = await Order.countDocuments(query);

    // 7) Special sort: full customer name
    if (sortBy === 'customerName') {
      const pipeline = [
        { $match: query },
        {
          $addFields: {
            fullName: {
              $trim: {
                input: {
                  $ifNull: [
                    '$customerName',
                    { $concat: [{ $ifNull: ['$fName', ''] }, ' ', { $ifNull: ['$lName', ''] }] },
                  ],
                },
              },
            },
          },
        },
        { $sort: { fullName: dir, _id: 1 } },
        { $skip: skip },
        { $limit: limitNum },
        { $project: projectFields },
      ];
      const orders = await Order.aggregate(pipeline)
        .collation({ locale: 'en', strength: 2 });

      return res.json({
        totalOrders,
        currentPage: pageNum,
        totalPages: Math.ceil(totalOrders / limitNum),
        orders,
      });
    }

    // 8) Normal sort path
    const sortSpec = SORT_MAP[sortBy]
      ? { [SORT_MAP[sortBy]]: dir, _id: 1 }
      : { orderDate: -1, _id: 1 };

    const orders = await Order.find(query, projectFields)
      .collation({ locale: 'en', strength: 2 })
      .sort(sortSpec)
      .skip(skip)
      .limit(limitNum)
      .lean();

    return res.json({
      totalOrders,
      currentPage: pageNum,
      totalPages: Math.ceil(totalOrders / limitNum),
      orders,
    });
  } catch (err) {
    console.error('Error fetching monthly orders:', err);
    const msg = err?.message?.includes('Provide either start/end')
      ? err.message
      : 'Internal server error';
    return res.status(500).json({ message: msg });
  }
});

export default router;

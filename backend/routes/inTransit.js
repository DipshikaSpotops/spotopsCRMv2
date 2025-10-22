import express from "express";
import Order from "../models/Order.js";
import moment from "moment-timezone";

const router = express.Router();

function getDateRange({ start, end, month, year }) {
  const tz = "America/Chicago";

  if (start && end) {
    const startDate = moment.tz(start, tz).startOf("day").toDate();
    const endDate   = moment.tz(end,   tz).endOf("day").toDate();
    return { startDate, endDate };
  } else if (month && year) {
    const monthMap = {
      Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
      Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12",
    };

    let paddedMonth;
    if (month.length === 3 && monthMap[month]) {
      paddedMonth = monthMap[month];
    } else if (!isNaN(month)) {
      paddedMonth = String(month).padStart(2, "0");
    } else {
      throw new Error("Invalid month format");
    }

    const startDate = moment.tz(`${year}-${paddedMonth}-01`, tz).startOf("month").toDate();
    const endDate   = moment.tz(`${year}-${paddedMonth}-01`, tz).endOf("month").toDate();
    return { startDate, endDate };
  }
  throw new Error("Provide either start/end or month/year");
}

router.get("/", async (req, res) => {
  try {
    const {
      start, end, month, year,
      page = 1, limit = 25,
      q = "", sortBy, sortOrder = "asc",
    } = req.query;

    const { startDate, endDate } = getDateRange({ start, end, month, year });
    const pageSize = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * pageSize;

    // Base filter: date range + status
    const filter = {
      orderDate: { $gte: startDate, $lt: endDate },
      orderStatus: "In Transit",
    };

    // Free-text search
    if (q && q.trim()) {
      const rx = new RegExp(q.trim(), "i");
      filter.$or = [
        { orderNo: rx },
        { customerName: rx },
        { fName: rx },
        { lName: rx },
        { salesAgent: rx },
        { phone: rx },
        { email: rx },
        { pReq: rx },
        { desc: rx },
        { partNo: rx },
        { make: rx },
        { model: rx },
        { supportNotes: rx }, // search inside notes too
        { additionalInfo: { $elemMatch: { yardName: rx } } },
        { additionalInfo: { $elemMatch: { status: rx } } },
        { additionalInfo: { $elemMatch: { expShipDate: rx } } },
      ];
    }

    const totalOrders = await Order.countDocuments(filter);

    // Sort mapping (use virtuals computed in $addFields)
    const dir = sortOrder === "desc" ? -1 : 1;
    const sortKeyMap = {
      orderDate: "orderDate",
      orderNo: "orderNo",
      pReq: "pReq",
      salesAgent: "salesAgent",
      orderStatus: "orderStatus",
      customerName: "fullName",           // computed
      yardName: "yardNameFirst",          // computed
      lastComment: "lastComment",         // computed from supportNotes
    };
    const sortField = sortKeyMap[sortBy] || "orderDate";

    // Build pipeline so we can sort by computed fields
    const pipeline = [
      { $match: filter },

      // Compute fields used for sorting
      {
        $addFields: {
          fullName: {
            $trim: {
              input: {
                $ifNull: [
                  "$customerName",
                  { $concat: [
                      { $ifNull: ["$fName", ""] }, " ",
                      { $ifNull: ["$lName", ""] }
                  ] }
                ]
              }
            }
          },
          yardNameFirst: { $ifNull: [ { $arrayElemAt: ["$additionalInfo.yardName", 0] }, "" ] },
          // safely pick the last support note
          lastIdx: {
            $cond: [
              { $gt: [ { $size: { $ifNull: ["$supportNotes", []] } }, 0 ] },
              { $subtract: [ { $size: "$supportNotes" }, 1 ] },
              -1
            ]
          },
        }
      },
      {
        $addFields: {
          lastComment: {
            $cond: [
              { $gte: ["$lastIdx", 0] },
              { $trim: { input: { $arrayElemAt: ["$supportNotes", "$lastIdx"] } } },
              ""
            ]
          }
        }
      },

      // Sort (case-insensitive)
      { $sort: { [sortField]: dir, _id: 1 } },

      { $skip: skip },
      { $limit: pageSize },

      // Project the fields you need
      {
        $project: {
          orderDate: 1, orderNo: 1, salesAgent: 1, customerName: 1, fName: 1, lName: 1,
          pReq: 1, partName: 1, desc: 1, partNo: 1,
          year: 1, make: 1, model: 1,
          email: 1, phone: 1,
          sAddressStreet: 1, sAddressCity: 1, sAddressState: 1, sAddressZip: 1,
          bAddressStreet: 1, bAddressCity: 1, bAddressState: 1, bAddressZip: 1,
          additionalInfo: 1, orderStatus: 1, supportNotes: 1,
          // expose computed if you want to render/verify
          // fullName: 1, yardNameFirst: 1, lastComment: 1,
        }
      },
    ];

    const orders = await Order.aggregate(pipeline)
      .collation({ locale: "en", strength: 2 }); // case-insensitive

    res.json({
      orders,
      totalOrders,
      totalPages: Math.ceil(totalOrders / pageSize),
      currentPage: parseInt(page, 10),
    });
  } catch (error) {
    console.error("Error fetching in-transit orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;

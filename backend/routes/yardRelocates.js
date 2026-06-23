import express from "express";
import { getOrderModelForBrand } from "../models/Order.js";
import moment from "moment-timezone";

const router = express.Router();

const EXCLUDED_ORDER_STATUSES = ["Order Cancelled", "Refunded", "Dispute"];
const PO_CANCELLED_STATUSES = ["po cancelled", "po canceled", "po cancel"];

function getDateRange({ start, end, month, year }) {
  const tz = "America/Chicago";

  if (start && end) {
    const startDate = moment.tz(start, tz).startOf("day").toDate();
    const endDate   = moment.tz(end,   tz).endOf("day").toDate();
    return { startDate, endDate };
  }

  if (month && year) {
    const map = {
      Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
      Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12"
    };
    const mm = map[month] || String(month).padStart(2, "0");
    const startDate = moment.tz(`${year}-${mm}-01`, tz).startOf("month").toDate();
    const endDate   = moment.tz(`${year}-${mm}-01`, tz).endOf("month").toDate();
    return { startDate, endDate };
  }

  throw new Error("Provide either start/end or month/year");
}

function buildBaseMatch({ startDate, endDate, q }) {
  const filter = {
    orderDate: { $gte: startDate, $lt: endDate },
    orderStatus: { $nin: EXCLUDED_ORDER_STATUSES },
    "additionalInfo.0": { $exists: true },
  };

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
      { make: rx },
      { model: rx },
      { trackingNo: rx },
      { additionalInfo: { $elemMatch: { yardName: rx } } },
      { additionalInfo: { $elemMatch: { trackingNo: rx } } },
      { additionalInfo: { $elemMatch: { customerTrackingNumberReplacement: rx } } },
      { additionalInfo: { $elemMatch: { yardTrackingNumber: rx } } },
      { additionalInfo: { $elemMatch: { returnTrackingCust: rx } } },
      { supportNotes: rx },
    ];
  }

  return filter;
}

const lastYardRelocateFilterStages = [
  {
    $addFields: {
      _lastYard: { $arrayElemAt: ["$additionalInfo", -1] },
    },
  },
  {
    $addFields: {
      _lastYardStatusNorm: {
        $toLower: { $trim: { input: { $ifNull: ["$_lastYard.status", ""] } } },
      },
      _lastYardEscProcessNorm: {
        $toLower: { $trim: { input: { $ifNull: ["$_lastYard.escalationProcess", ""] } } },
      },
    },
  },
  {
    $match: {
      $or: [
        { _lastYardStatusNorm: { $in: PO_CANCELLED_STATUSES } },
        {
          _lastYardStatusNorm: "escalation",
          _lastYardEscProcessNorm: "return",
        },
      ],
    },
  },
];

const projectFields = {
  orderDate: 1,
  orderNo: 1,
  pReq: 1,
  partName: 1,
  salesAgent: 1,
  customerName: 1,
  fName: 1,
  lName: 1,
  additionalInfo: 1,
  supportNotes: 1,
  orderStatus: 1,
  email: 1,
  phone: 1,
  sAddressStreet: 1, sAddressCity: 1, sAddressState: 1, sAddressZip: 1,
  desc: 1, partNo: 1, warranty: 1, vin: 1, programmingRequired: 1,
  year: 1, make: 1, model: 1,
};

const SIMPLE_MAP = {
  orderDate: "orderDate",
  orderNo: "orderNo",
  pReq: "pReq",
  salesAgent: "salesAgent",
  orderStatus: "orderStatus",
};

router.get("/", async (req, res) => {
  try {
    const {
      start, end, month, year,
      page = 1,
      limit = 25,
      q = "",
      sortBy,
      sortOrder = "asc",
    } = req.query;

    const { startDate, endDate } = getDateRange({ start, end, month, year });
    const pageSize = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * pageSize;
    const dir = sortOrder === "desc" ? -1 : 1;
    const baseMatch = buildBaseMatch({ startDate, endDate, q });

    const Order = getOrderModelForBrand(req.brand);

    const countPipeline = [
      { $match: baseMatch },
      ...lastYardRelocateFilterStages,
      { $count: "total" },
    ];
    const countResult = await Order.aggregate(countPipeline);
    const totalOrders = countResult[0]?.total ?? 0;
    const totalPages = Math.ceil(totalOrders / pageSize);

    let pipeline;

    if (sortBy === "customerName") {
      pipeline = [
        { $match: baseMatch },
        ...lastYardRelocateFilterStages,
        {
          $addFields: {
            fullName: {
              $trim: {
                input: {
                  $ifNull: [
                    "$customerName",
                    { $concat: [{ $ifNull: ["$fName", ""] }, " ", { $ifNull: ["$lName", ""] }] },
                  ],
                },
              },
            },
          },
        },
        { $sort: { fullName: dir, _id: 1 } },
        { $skip: skip },
        { $limit: pageSize },
        { $project: projectFields },
      ];
    } else if (sortBy === "yardName") {
      pipeline = [
        { $match: baseMatch },
        ...lastYardRelocateFilterStages,
        {
          $addFields: {
            firstYardName: {
              $ifNull: [{ $arrayElemAt: ["$additionalInfo.yardName", 0] }, ""],
            },
          },
        },
        { $sort: { firstYardName: dir, _id: 1 } },
        { $skip: skip },
        { $limit: pageSize },
        { $project: projectFields },
      ];
    } else if (sortBy === "lastComment") {
      pipeline = [
        { $match: baseMatch },
        ...lastYardRelocateFilterStages,
        {
          $addFields: {
            _lastIdx: { $subtract: [{ $size: { $ifNull: ["$supportNotes", []] } }, 1] },
          },
        },
        {
          $addFields: {
            lastComment: {
              $trim: {
                input: {
                  $cond: [
                    { $gte: ["$_lastIdx", 0] },
                    { $arrayElemAt: ["$supportNotes", "$_lastIdx"] },
                    "",
                  ],
                },
              },
            },
          },
        },
        { $sort: { lastComment: dir, _id: 1 } },
        { $skip: skip },
        { $limit: pageSize },
        { $project: { ...projectFields, lastComment: 1 } },
      ];
    } else {
      const sortSpec = SIMPLE_MAP[sortBy]
        ? { [SIMPLE_MAP[sortBy]]: dir, _id: 1 }
        : { orderDate: -1, _id: 1 };
      pipeline = [
        { $match: baseMatch },
        ...lastYardRelocateFilterStages,
        { $sort: sortSpec },
        { $skip: skip },
        { $limit: pageSize },
        { $project: projectFields },
      ];
    }

    const orders = await Order.aggregate(pipeline)
      .collation({ locale: "en", strength: 2 });

    res.json({
      orders,
      totalOrders,
      totalPages,
      currentPage: parseInt(page, 10),
    });
  } catch (error) {
    console.error("Error fetching yard relocates orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;

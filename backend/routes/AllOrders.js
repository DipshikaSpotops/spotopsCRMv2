// routes/AllOrders.js
import express from "express";
import Order from "../models/Order.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const searchTerm = (req.query.searchTerm || "").trim();
    const sortBy = req.query.sortBy || "";      // "orderDate" | "orderNo" | "pReq" | "customerName" | "yardName" | "orderStatus"
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    // ---- Build search query ---------------------------------------------
    const query = {};
    if (searchTerm) {
      // Escape special regex characters in search term
      const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escapedSearchTerm, "i");
      query.$or = [
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
        { trackingNo: rx }, // top-level trackingNo (if exists)
        { additionalInfo: { $elemMatch: { yardName: rx } } },
        { additionalInfo: { $elemMatch: { trackingNo: rx } } }, // trackingNo array within additionalInfo
        { additionalInfo: { $elemMatch: { customerTrackingNumberReplacement: rx } } },
        { additionalInfo: { $elemMatch: { yardTrackingNumber: rx } } },
        { additionalInfo: { $elemMatch: { returnTrackingCust: rx } } },
      ];
    }

    const totalCount = await Order.countDocuments(query);

    // ---- Sorting logic ---------------------------------------------------
    // We use aggregation for the special computed fields (customerName, yardName).
    const projectFields = {
      orderDate: 1,
      orderNo: 1,
      salesAgent: 1,
      customerName: 1,
      fName: 1,
      lName: 1,
      pReq: 1,
      desc: 1,
      additionalInfo: 1,
      email: 1,
      phone: 1,
      bAddressCity: 1,
      bAddressState: 1,
      bAddressZip: 1,
      bAddressStreet: 1,
      sAddressCity: 1,
      sAddressState: 1,
      sAddressZip: 1,
      sAddressStreet: 1,
      partNo: 1,
      warranty: 1,
      vin: 1,
      programmingRequired: 1,
      programmingCostQuoted: 1,
      year: 1,
      make: 1,
      model: 1,
      orderStatus: 1,
    };

    // default sort (by date, newest first)
    let pipeline = [
      { $match: query },
      { $sort: { orderDate: -1, _id: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: projectFields },
    ];

    // Map simple sorts that do not need computed fields
    const SIMPLE_MAP = {
      orderDate: "orderDate",
      orderNo: "orderNo",
      pReq: "pReq",                  // Part Info column
      salesAgent: "salesAgent",
      orderStatus: "orderStatus",
    };

    if (sortBy === "customerName") {
      pipeline = [
        { $match: query },
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
        { $sort: { fullName: sortOrder, _id: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: projectFields },
      ];
    } else if (sortBy === "yardName") {
      pipeline = [
        { $match: query },
        {
          $addFields: {
            firstYardName: {
              $ifNull: [{ $arrayElemAt: ["$additionalInfo.yardName", 0] }, ""],
            },
          },
        },
        { $sort: { firstYardName: sortOrder, _id: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: projectFields },
      ];
    } else if (SIMPLE_MAP[sortBy]) {
      pipeline = [
        { $match: query },
        { $sort: { [SIMPLE_MAP[sortBy]]: sortOrder, _id: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: projectFields },
      ];
    }

    const orders = await Order.aggregate(pipeline).collation({ locale: "en", strength: 2 });

    res.status(200).json({
      orders,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      currentPage: page,
    });
  } catch (err) {
    console.error("Error fetching paginated orders:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

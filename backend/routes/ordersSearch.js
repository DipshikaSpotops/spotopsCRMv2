import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// Which fields the UI needs
const PROJECTION = {
  orderNo: 1,
  orderDate: 1,
  desc: 1,
  salesAgent: 1,
  customerName: 1,
  fName: 1,
  lName: 1,
  email: 1,
  phone: 1,
  vin: 1,
  pReq: 1,
  year: 1,
  make: 1,
  model: 1,
  partNo: 1,
  warranty: 1,
  programmingRequired: 1,
  sAddressStreet: 1,
  sAddressCity: 1,
  sAddressState: 1,
  sAddressZip: 1,
  orderStatus: 1,
  "additionalInfo.0.yardName": 1,
  "additionalInfo.0.email": 1,
  "additionalInfo.0.phone": 1,
  "additionalInfo.0.status": 1,
  "additionalInfo.0.stockNo": 1,
};

function getPaging(req) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limitRaw = Math.max(parseInt(req.query.limit || "25", 10), 1);
  const limit = Math.min(limitRaw, 100); // guardrail
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

router.get("/ordersPerPage", async (req, res) => {
  try {
    const { page, limit, skip } = getPaging(req);
    const searchTerm = (req.query.searchTerm || "").trim();
    const coll = mongoose.connection.collection("orders");

    // No search term → normal paginate (fast path)
    if (searchTerm.length < 2) {
      const [orders, totalCount] = await Promise.all([
        coll
          .find({})
          .project(PROJECTION)
          .sort({ orderDate: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        coll.countDocuments({}),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalCount / limit));
      return res.json({ orders, totalPages, totalCount });
    }

    // With search term → Atlas Search (fuzzy + autocomplete)
    const searchablePaths = [
      "orderNo",
      "customerName",
      "fName",
      "lName",
      "phone",
      "email",
      "vin",
      "desc",
      "additionalInfo.yardName",
      "additionalInfo.stockNo",
      "additionalInfo.trackingNo",
      "additionalInfo.customerTrackingNumberReplacement",
      "additionalInfo.yardTrackingNumber",
      "additionalInfo.returnTrackingCust",
    ];

    const searchStage = {
      $search: {
        index: "default",
        compound: {
          should: [
            {
              autocomplete: {
                query: searchTerm,
                path: searchablePaths,
                tokenOrder: "any",
                fuzzy: { maxEdits: 1, prefixLength: 1 },
              },
            },
            {
              text: {
                query: searchTerm,
                path: searchablePaths,
                fuzzy: { maxEdits: 1, prefixLength: 1 },
              },
            },
          ],
          minimumShouldMatch: 1,
        },
      },
    };

    // 1) Page of results
    const resultsPipeline = [
      searchStage,
      { $sort: { score: { $meta: "searchScore" }, orderDate: -1, _id: -1 } },
      { $project: { ...PROJECTION, score: { $meta: "searchScore" } } },
      { $skip: skip },
      { $limit: limit },
    ];

    // 2) Total count via $searchMeta
    const metaPipeline = [
      {
        $searchMeta: {
          index: "default",
          count: { type: "total" },
          ...searchStage.$search, // reuse same search
        },
      },
      { $project: { total: "$count.total" } },
    ];

    const [orders, metaArr] = await Promise.all([
      coll.aggregate(resultsPipeline).toArray(),
      coll.aggregate(metaPipeline).toArray(),
    ]);

    const totalCount = metaArr?.[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return res.json({ orders, totalPages, totalCount });
  } catch (e) {
    console.error("ordersPerPage error:", e);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
});

export default router;

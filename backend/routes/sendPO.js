import express from "express";
import puppeteer from "puppeteer";
import Order from "../models/Order.js";
import nodemailer from "nodemailer";
import moment from "moment-timezone";
import multer from "multer";
import dotenv from "dotenv";
dotenv.config();


const cardNumber = process.env.CARD_NUMBER || "**** **** **** 7195";
const cardExpiry = process.env.CARD_EXPIRY || "**/**";
const cardCvv = process.env.CARD_CVV || "***";

const router = express.Router();
const upload = multer();

// Send PO route
router.post("/sendPOEmailYard/:orderNo", upload.any(), async (req, res) => {
  try {
    const { orderNo } = req.params;
    const firstName = req.query.firstName || "System";

    const yardIndex = parseInt(req.body.yardIndex, 10);
    console.log(`Sending PO for order ${orderNo}, yard index ${yardIndex}`);

    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const yard = order.additionalInfo[yardIndex];
    if (!yard) return res.status(400).json({ message: "Invalid yard index" });

    const yardEmail = (yard.email || "").trim();
    if (!yardEmail) {
      return res.status(200).json({ message: "No yard email provided. PO not sent." });
    }

    // Calculate prices
    const partPrice = parseFloat(yard.partPrice) || 0;
    let shipping = 0;
    let shippingValue = "Included";
    if (yard.shippingDetails?.includes("Yard shipping")) {
      const match = yard.shippingDetails.match(/Yard shipping:\s*(\d+)/);
      if (match) {
        shipping = parseFloat(match[1]);
        shippingValue = shipping === 0 ? "Included" : `$${shipping.toFixed(2)}`;
      }
    } else {
      shippingValue = "Own Shipping (Auto Parts Group Corp)";
    }
    const subtotal = partPrice;
    const grandTotal = subtotal + shipping;

    // Full PO HTML template
    const html = `
<html>
  <head>
    <meta charset="utf-8" />
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      body {
        font-family: 'Roboto', Arial, sans-serif;
        margin: 0;
        padding: 20px;
        font-size: 13px;
        line-height: 1.6;
        background: #fff;
        color: #111;
      }
      .header {
        background:#0b2545;
        color:white;
        padding:12px;
        text-align:center;
        font-size:18px;
        font-weight:600;
      }
      .header div { font-size:14px; margin-top:6px; }

      .title-row {
        margin: 8px 0 12px 0;
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
      }
      .blind-label {
        color: #c40505;
        font-weight: 700;
        font-size: 16px;
        margin-bottom: 4px;
        line-height: 1.2;
      }
      .title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 0;
        line-height: 1.2;
        color: #0b2545;
      }
      .po-info {
        text-align:right;
        font-size:14px;
        line-height:1.8;
        margin-bottom: 0;
        font-weight:600;
      }

      .three-column {
        display:flex;
        gap:15px;
        margin:2px 0;
        color:#0b2545;
      }
      .column {
        flex:1;
        border:1px solid #ccc;  
        padding:12px;
        font-size:13px;
        font-weight:600;
      }
      .column h4 {
        margin:0 0 8px 0;
        background:#0b2545;
        color:white;
        padding:6px;
        font-size:13px;
        font-weight:600;
      }

      table {
        width:100%;
        border-collapse:collapse;
        margin-top:15px;
        table-layout: fixed;
      }
      th, td {
        border:1px solid #ccc; 
        padding:10px;
        vertical-align:top;
        font-size:13px;
        line-height:1.4;
        color:#0b2545;
        font-weight:600;
      }
      th {
        background:#0b2545;
        font-weight:600;
        text-align:left;
        color:white;
      }

      /* section headers */
      .section-head th {
        background: #0b2545;
        color: #fff;
        text-align: left;
        font-weight: 600;
        padding: 10px;
      }

      .inner td { 
        border: 1px solid #e0e0e0; 
        padding: 8px; 
        font-size: 13px;
        color: #0b2545;
        font-weight:600;
      }
      .inner .label { font-weight: 600; color: #111; }

      .summary .grand td {
        background: #0b2545 !important;
        color: #fff !important;
        font-weight: 700;
      }
        .footer-note{
        margin-top:20px;
        color:#0b2545;
        font-size:14px;
         font-weight: 600;
        }
        
    </style>
  </head>
  <body>
    <div>
      <div class="header">
        AUTO PARTS GROUP CORP
        <div>5306 Blaney Way, Dallas, Texas, 75227</div>
        <div>+1 (888) 732-8680 | purchase@auto-partsgroup.com</div>
      </div>

      <div class="title-row">
        <div>
          <div class="blind-label">BLIND SHIPPING - NO TAG AND INVOICES</div>
          <div class="title">PURCHASE ORDER</div>
        </div>
        <div class="po-info">
          <div><strong>PO NO:</strong> ${order.orderNo}</div>
          <div><strong>PO Date:</strong> ${moment().tz("America/Chicago").format("MM/DD/YYYY")}</div>
          <div><strong>Tax ID:</strong> 32093721457</div>
        </div>
      </div>

      <div class="three-column">
        <div class="column">
          <h4>Purchase Order To</h4>
          <p>${yard.yardName}<br>${yard.street}, ${yard.city}, ${yard.state}, ${yard.zipcode}</p>
        </div>
        <div class="column">
          <h4>Ship To</h4>
          <p>${order.attention || order.fName + " " + order.lName}<br>${order.sAddressStreet}, ${order.sAddressCity}, ${order.sAddressState}, ${order.sAddressZip}</p>
        </div>
        <div class="column">
          <h4>Bill To</h4>
          <p>Auto Parts Group Corp<br>5306 Blaney Way<br>Dallas, Texas, 75227<br>purchase@auto-partsgroup.com<br>+1 (888) 732-8680</p>
        </div>
      </div>

      <!-- MAIN TABLE -->
      <table>
       <thead>
  <tr>
    <th style="width:60%">Part Description</th>
    <th style="width:20%">Quantity</th>
    <th style="width:20%">Amount</th>
  </tr>
</thead>
<tbody>
  <tr>
    <td>
      Year: ${order.year}<br>
      Make: ${order.make}<br>
      Model: ${order.model}<br>
      Part: ${order.pReq}<br>
      Description: ${order.desc}<br>
      VIN: ${order.vin || "NA"}<br>
      Part No: ${order.partNo || "NA"}<br>
      Stock No: ${yard.stockNo || "NA"}<br>
      Warranty: ${yard.warranty} days
    </td>
    <td>01</td>
    <td>$${partPrice.toFixed(2)}</td>
  </tr>

  <!-- Section header -->
  <tr class="section-head">
    <th style="width:60%">Card Info</th>
    <th colspan="2" style="width:40%">Summary</th>
  </tr>

  <!-- Card Info + Summary -->
  <tr>
    <!-- Card Info takes the same width as Part Description (60%) -->
    <td style="padding:0;">
      <table class="inner" style="width:100%; border-collapse:collapse;">
        <colgroup>
          <col style="width:45%">
          <col style="width:55%">
        </colgroup>
        <tr><td class="label">Card Number:</td><td>${cardNumber}</td></tr>
<tr><td class="label">Expiration Date:</td><td>${cardExpiry}</td></tr>
<tr><td class="label">CVV:</td><td>${cardCvv}</td></tr>

      </table>
    </td>

    <!-- Summary takes exactly Quantity + Amount (20% + 20% = 40%) -->
    <td colspan="2" style="padding:0;">
      <table class="inner summary" style="width:100%; border-collapse:collapse;">
        <colgroup>
          <col style="width:50%">
          <col style="width:50%">
        </colgroup>
        <tr><td class="label">Subtotal:</td><td>$${subtotal.toFixed(2)}</td></tr>
        <tr><td class="label">Shipping:</td><td>${shippingValue}</td></tr>
        <tr><td class="label">Tax:</td><td>Included</td></tr>
        <tr class="grand"><td class="label">Grand Total:</td><td>$${grandTotal.toFixed(2)}</td></tr>
      </table>
    </td>
  </tr>
</tbody>
      </table>

      <div class="footer-note">
        <strong>Special Instructions:</strong><br>
        - Please identify yourself with the Purchase Order No.<br>
        - Send pictures to purchase@auto-partsgroup.com before shipping.<br>
        - Pack the part carefully. We are not accountable for shipping damage.<br>
        - Ensure "No Tags or Labels" — this is blind shipping.<br>
        - Send tracking and carrier info to our email.<br>
        - Charging the card confirms agreement with our T&Cs.
      </div>
    </div>
  </body>
</html>
`;

    // Generate PDF
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    // Send email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.PURCHASE_EMAIL, pass: process.env.PURCHASE_PASS },
    });

    const attachments = [
      { filename: `${order.orderNo}-PO.pdf`, content: pdfBuffer },
      ...req.files.map((file, index) => ({
        filename: file.originalname || `attachment-${index + 1}`,
        content: file.buffer,
      })),
    ];

    await transporter.sendMail({
      from: process.env.PURCHASE_EMAIL,
      to: yardEmail,
      bcc: "dipsikha.spotopsdigital@gmail.com",
      subject: `Purchase Order | ${order.orderNo} | ${order.year} ${order.make} ${order.model} | ${order.pReq}`,
      html: `<p>Dear ${yard.agentName},</p><p>Please find attached the Purchase Order.</p>`,
      attachments,
    });

    // Update DB
    const nowDallas = moment().tz("America/Chicago");
const isoDallas = nowDallas.toDate(); // 2024-11-12T18:19:23.764+00:00
const formattedDate = nowDallas.format("DD MMM, YYYY HH:mm");

const yardLabel = `Yard ${yardIndex + 1}`;

// Update yard status and add poSentDate
order.additionalInfo[yardIndex].status = "Yard PO Sent";
order.additionalInfo[yardIndex].poSentDate = isoDallas;

// ensure notes array exists
order.additionalInfo[yardIndex].notes = order.additionalInfo[yardIndex].notes || [];
order.additionalInfo[yardIndex].notes.push(`${yardLabel} PO sent by ${firstName} on ${formattedDate}`);

// Update main order fields
order.orderStatus = "Yard Processing";
order.orderHistory.push(`${yardLabel} PO sent by ${firstName} on ${formattedDate}`);

await order.save();

    res.json({ message: "PO email sent and status updated" });
  } catch (err) {
    console.error("Error sending PO:", err);
    res.status(500).json({ message: "Failed to send PO", error: err.message });
  }
});

export default router;

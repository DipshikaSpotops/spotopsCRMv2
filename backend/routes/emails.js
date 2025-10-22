// routes/emails.js (ESM)
import express from "express";
import { formatInTimeZone } from "date-fns-tz";


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
// quick ping so you can test mount with GET in a browser
router.get("/_health", (req, res) => {
  console.log("[emails] /_health hit");
  res.json({ ok: true });
});

// util
function formatMMDDYYYY(dt) {
  const d = new Date(dt);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}-${dd}-${yyyy}`;
}
function prettyDate(iso, tz = "America/Chicago") {
  if (!iso) return "";
  try {
    return formatInTimeZone(new Date(iso), tz, "MMM do, yyyy");
  } catch {
    return "";
  }
}
// POST /emails/order-cancel/:orderNo
router.post("/order-cancel/:orderNo", async (req, res) => {
  console.log("[emails] order-cancel hit", req.method, req.originalUrl);

  try {
    const { orderNo } = req.params;
    const cancelledRefAmount = req.query.cancelledRefAmount ?? "0.00";
    const firstName = req.query.firstName; 
    console.log("[emails] params:", { orderNo, cancelledRefAmount, firstName });

    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const formattedDate = prettyDate(order.orderDate);
    console.log("formattedDate", formattedDate);
      order.customerName ||
      [order.fName, order.lName].filter(Boolean).join(" ") ||
      "Customer";
    const toEmail = order.email;
    if (!toEmail) return res.status(400).json({ message: "No customer email on file" });

    const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SERVICE_EMAIL, 
    pass: process.env.SERVICE_PASS,  
  },
});


    await transporter.sendMail({
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: toEmail,
      bcc:
        process.env.SUPPORT_BCC,
      subject: `Order Cancellation | ${order.orderNo}`,
        html: `
        <p>I hope this email finds you well. I am writing to inform you about the cancellation of your recent order# <b>${order.orderNo}</b>, dated <b>${formattedDate}</b>, for a <b>${order.year} ${order.make}
        ${order.model} ${order.pReq}</b> with <b>50 Stars Auto Parts</b>.
        <p>We regret any inconvenience this may have caused you.</p>
        <b>We have cancelled your order and will refund you $${cancelledRefAmount}  to the same source account.</b>
        Please call us if you have any questions. Rest assured, any payment made for the cancelled order will be promptly refunded to your original payment method. You can expect to see the refund reflected in your account within 3-5 business days.<br>
        <p>We understand the importance of timely and efficient service, and we sincerely apologize for any inconvenience this cancellation may have caused. Our team is working diligently to prevent such occurrences in the future.<br>
        If you have any questions or require further assistance, please don't hesitate to contact our customer support team at <b>+1(888)-653-2808</b>. We are here to assist you in any way we can.Thank you for your understanding and continued support.<br></p>
        <p><b>Please reply to this email with a quick confirmation to acknowledge and approve this cancellation request.</b></p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
        <p>${firstName},<br>Customer Service Team<br>50 STARS AUTO PARTS<br>+1 (888) 732-8680<br>service@50starsautoparts.com<br>www.50starsautoparts.com</p>`,
      attachments: [
        {
          filename: "logo.png",
          path:
            process.env.LOGO_URL ||
            "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png",
          cid: "logo",
        },
      ],
    });

    res.json({ message: "Cancellation email sent successfully" });
  } catch (err) {
    console.error("[emails] error:", err);
    res.status(500).json({ message: "Server error", error: String(err) });
  }
});
router.post("/orders/sendRefundConfirmation/:orderNo", upload.single("pdfFile"), async (req, res) => {
  console.log("[emails] sendRefundConfirmation hit");
  try {
    const { orderNo } = req.params;
    const refundedAmount = req.query.refundedAmount;
    const firstName = req.query.firstName?.trim() || "System";

    if (!refundedAmount) {
      return res.status(400).json({ message: "Refunded amount is missing." });
    }

    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const pdfFile = req.file;
    if (!pdfFile) return res.status(400).json({ message: "No PDF file uploaded" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SERVICE_EMAIL,
        pass: process.env.SERVICE_PASS,
      },
    });

    const customerName =
      order.customerName ||
      [order.fName, order.lName].filter(Boolean).join(" ") ||
      "Customer";

    const logoUrl =
      process.env.LOGO_URL ||
      "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png";

    const toEmail = (order.email || "").trim();
    if (!toEmail)
      return res.status(400).json({ message: "No customer email on file" });

    const mailOptions = {
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: toEmail,
      bcc: process.env.SUPPORT_BCC || "service@50starsautoparts.com,dipsikha.spotopsdigital@gmail.com",
      subject: `Refund Processed for Your Order ${orderNo} | 50 Stars Auto Parts`,
      html: `
        <p>Dear ${customerName},</p>
        <p>We are reaching out to confirm that your refund of <b>$${refundedAmount}</b> for order <b>#${orderNo}</b> has been successfully processed.</p>
        <p>Attached to this email, you’ll find a copy of the refund receipt for your records.</p>
        <p>Please allow <b>3–5 business days</b> for the refund to reflect on your original payment method, as processing times may vary based on your financial institution.</p>
        <p>If you have any questions or require further assistance, please feel free to reach out — we’re happy to help.</p>
        <p>Thank you for choosing <b>50 Stars Auto Parts</b>. We appreciate your business and look forward to serving you again.</p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;" /></p>
        <p>${firstName}<br/>
        Customer Service Team<br/>
        50 STARS AUTO PARTS<br/>
        +1 (866) 207-5533<br/>
        service@50starsautoparts.com<br/>
        <a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>
      `,
      attachments: [
        {
          filename: pdfFile.originalname,
          content: pdfFile.buffer,
        },
        {
          filename: "logo.png",
          path: logoUrl,
          cid: "logo",
        },
      ],
    };

    console.log("[emails] refund confirmation mailOptions prepared:", {
      to: toEmail,
      refundedAmount,
      orderNo,
    });

    await transporter.sendMail(mailOptions);
    console.log("[emails] Refund confirmation email sent successfully");

    res.json({ message: "Refund confirmation email sent successfully" });
  } catch (error) {
    console.error("[emails] Refund confirmation error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
// to send delivery email
router.post("/customer-delivered/:orderNo", async (req, res) => {
  try {
    const { orderNo } = req.params;
    const yardIndex = parseInt(req.query.yardIndex ?? req.body?.yardIndex ?? 1, 10);
    const firstName  = (req.query.firstName ?? req.body?.firstName ?? "").toString().trim();

    if (!yardIndex || Number.isNaN(yardIndex)) {
      return res.status(400).json({ message: "yardIndex (1-based) is required" });
    }

    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const idx0 = yardIndex - 1;
    const yard = order.additionalInfo?.[idx0];
    if (!yard) return res.status(404).json({ message: `Yard ${yardIndex} not found` });

    // Pull the persisted tracking fields from DB
    const cxTrackingNo  = String(yard.trackingNo ?? "").trim();
    const trackingLink  = String(yard.trackingLink ?? "").trim();
    const cxShipperName = String(yard.shipperName ?? "").trim();


    const customerName =
      order.customerName ||
      [order.fName, order.lName].filter(Boolean).join(" ") ||
      "Customer";
    const toEmail = (order.email || "").trim();
    if (!toEmail) return res.status(400).json({ message: "No customer email on file" });

    // Create transporter from env (same style as your other routes)
    const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SERVICE_EMAIL, 
    pass: process.env.SERVICE_PASS,  
  },
});


    const fromEmail = process.env.SERVICE_EMAIL || process.env.SMTP_USER || "service@50starsautoparts.com";
    const bccList =
      process.env.SUPPORT_BCC ||
      "service@50starsautoparts.com,dipsikha.spotopsdigital@gmail.com";

    const logoUrl =
      process.env.LOGO_URL ||
      "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png";

    await transporter.sendMail({
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: toEmail,
      bcc: bccList,
      subject: `Thank You for Your Order (${orderNo}) – Delivery Confirmation`,
      html: `
        <p>Hi ${customerName},</p>
        <p>We’re excited to let you know that your order has been successfully delivered today!</p>
        <p>Thank you so much for choosing 50 Stars Auto Parts. We truly appreciate your trust in us and are grateful for the opportunity to serve you.</p>
        <p>Here’s a quick summary of your order:<br>
          <strong>Order Number:</strong> ${orderNo}<br>
          <strong>Tracking No:</strong> ${cxTrackingNo || "—"}<br>
          <strong>Tracking Link:</strong> ${cxShipperName || ""} ${trackingLink ? `- <a href="${trackingLink}" target="_blank" rel="noopener noreferrer">${trackingLink}</a>` : ""}</p>
        <p>If there’s anything you need, or if you have any questions about your order, feel free to reach out — we’re always happy to help.</p>
        <p>Thanks once again for shopping with us. We look forward to helping you with your auto parts needs in the future!</p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
        <p>${firstName}<br/>
        Customer Service Team<br/>
        50 STARS AUTO PARTS<br/>
        +1 (888) 732-8680<br/>
        service@50starsautoparts.com<br/>
        www.50starsautoparts.com</p>
      `,
      attachments: [
        { filename: "logo.png", path: logoUrl, cid: "logo" }
      ],
    });

    return res.json({ message: "Customer delivery email sent." });
  } catch (err) {
    console.error("[emails] customer-delivered error:", err);
    res.status(500).json({ message: "Server error", error: String(err?.message || err) });
  }
});
// to send tracking info email
router.post("/orders/sendTrackingInfo/:orderNo", async (req, res) => {
  console.log("[emails] sendTrackingInfo hit");
  try {
    const order = await Order.findOne({ orderNo: req.params.orderNo });
    if (!order) return res.status(400).send("Order not found");

    const { trackingNo, eta, shipperName, link, firstName } = req.body;
    const customerName = order.customerName || order.fName || "Customer";

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SERVICE_EMAIL,
        pass: process.env.SERVICE_PASS,
      },
    });

    const mailOptions = {
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: order.email,
      bcc: "dipsikha.spotopsdigital@gmail.com",
      subject: `Tracking Details / Order No. ${req.params.orderNo}`,

      // Add plain-text version (boosts deliverability)
      text: `Hi ${customerName},
Your order with 50 Stars Auto Parts has been shipped.
Tracking: ${shipperName} - ${trackingNo}
ETA: ${eta}
Link: ${link}
If you have any questions, contact us at +1 (888) 732-8680 or service@50starsautoparts.com.`,

      // Clean, minimal HTML
      html: `
        <p>Hi ${customerName},</p>
        <p>This email is regarding the order you placed with <strong>50 Stars Auto Parts</strong>. Below are your tracking details:</p>
        <p><strong>${shipperName}</strong> – ${trackingNo}</p>
        <p><strong>ETA (YYYY-MM-DD):</strong> ${eta}</p>
        <p><strong>Tracking Link:</strong> <a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a></p>
        <p>Please note: If the ETA is not updated yet, it may take up to 24 hours to appear on the carrier’s site.</p>
        <p>Feel free to call us if you have any questions.</p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
        <p>${firstName}<br>
        Customer Service Team<br>
        50 STARS AUTO PARTS<br>
        +1 (888) 732-8680<br>
        service@50starsautoparts.com<br>
        <a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>`,

      attachments: [
        {
          filename: "logo.png",
          path: "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png",
          cid: "logo",
        },
      ],
    };

    console.log("mail", mailOptions);

    await transporter.sendMail(mailOptions);
    console.log("Tracking email sent successfully.");
    res.json({ message: "Tracking email sent successfully." });

  } catch (error) {
    console.error("Error sending tracking email:", error);
    res.status(500).json({ message: `Error sending mail: ${error.message}` });
  }
});
// Send refund email to Yard (with PDF)
router.post("/orders/sendRefundEmail/:orderNo", upload.single("pdfFile"), async (req, res) => {
  console.log("[emails] sendRefundEmailYard hit");
  try {
    const { orderNo } = req.params;
    let { firstName, yardIndex, refundReason, returnTracking, refundToCollect, shipper } = req.query;
    firstName = firstName?.trim() || "";


    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const idx0 = parseInt(yardIndex ?? 1, 10) - 1;
    const yard = order.additionalInfo?.[idx0];
    if (!yard) return res.status(400).json({ message: `Yard ${yardIndex} not found` });

    const pdfFile = req.file;
    if (!pdfFile) return res.status(400).send("No PDF file uploaded");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SERVICE_EMAIL,
        pass: process.env.SERVICE_PASS,
      },
    });

    const yardAgent = yard.agentName || "Yard";
    const partPrice = parseFloat(yard.partPrice ?? 0);
    const yardOSorYS = yard.shippingDetails || "";
    let shippingValueYard = 0;
    if (yardOSorYS.includes("Yard shipping")) {
      const splitVal = yardOSorYS.split(":")[1];
      shippingValueYard = parseFloat(splitVal?.trim() || 0);
    }
    const others = parseFloat(yard.others ?? 0);
    const chargedAmount = partPrice + shippingValueYard + others;

    const stockNo = yard.stockNo || "N/A";
    const yardEmail = yard.email || "";
    const logoUrl =
      process.env.LOGO_URL ||
      "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png";

    if (!yardEmail) {
      return res.status(400).json({ message: "No yard email found for this yard entry" });
    }

    const mailOptions = {
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: yardEmail,
      bcc: `purchase@auto-partsgroup.com,dipsikha.spotopsdigital@gmail.com`,
      subject: `Request for Yard Refund | ${order.orderNo}`,
      html: `
        <p>Dear ${yardAgent},</p>
        <p>
          I am writing to bring to your attention that there was a charge on my credit card
          for Order ID <b>#${order.orderNo}</b>, for a <b>${order.year} ${order.make} ${order.model} ${order.pReq}</b>.
          I request a refund for the same.
        </p>
        <p>Requested refund amount: <b>$${refundToCollect || "—"}</b></p>
        <p>Stock No: <b>${stockNo}</b></p>
        <p>Return tracking number: <b>${returnTracking || "—"}</b></p>
        <p>Refund Reason: <b>${refundReason || "—"}</b></p>
        <p>
          I kindly request you to process the refund at your earliest convenience and share
          the refund receipt with us.
        </p>
        <p>
          If any further information or documentation is required, please do not hesitate to
          contact us.
        </p>
        <p>
          Thank you for your understanding and cooperation. I appreciate your prompt attention
          to this matter and look forward to a swift resolution.
        </p>
        <p>
          Note: If you have another company name or DBA, please let us know. The Purchase Order
          has been attached below for your reference.
        </p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;" /></p>
        <p>${firstName},<br/>
        Customer Service Team<br/>
        50 STARS AUTO PARTS<br/>
        +1 (866) 207-5533<br/>
        service@50starsautoparts.com<br/>
        <a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>
      `,
      attachments: [
        {
          filename: pdfFile.originalname,
          content: pdfFile.buffer,
        },
        {
          filename: "logo.png",
          path: logoUrl,
          cid: "logo",
        },
      ],
    };

    console.log("[emails] refund mailOptions prepared:", {
      to: yardEmail,
      orderNo,
      yardIndex,
      refundReason,
    });

    await transporter.sendMail(mailOptions);
    console.log("[emails] Refund email sent successfully");
    res.json({ message: "Refund email sent successfully" });
  } catch (error) {
    console.error("[emails] Refund email send error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


export default router;

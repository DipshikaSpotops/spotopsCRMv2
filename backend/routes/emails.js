// routes/emails.js
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
// Helper function to clean firstName (remove duplicates, comma-separated values)
const cleanFirstName = (firstName) => {
  if (!firstName) return "Auto Parts Group";
  let cleaned = String(firstName).trim();
  // If firstName contains comma, split and take first part only
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
    cleaned = parts[0] || "Auto Parts Group";
  }
  return cleaned;
};
// POST /emails/order-cancel/:orderNo
router.post("/order-cancel/:orderNo", async (req, res) => {
  console.log("[emails] order-cancel hit", req.method, req.originalUrl);

  try {
    const { orderNo } = req.params;
    const cancelledRefAmount = req.query.cancelledRefAmount ?? "0.00";
    const firstName = cleanFirstName(req.query.firstName ?? "");
    console.log("[emails] params:", { orderNo, cancelledRefAmount, firstName });

    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const formattedDate = prettyDate(order.orderDate);
    console.log("formattedDate", formattedDate);
    const customerName = cleanCustomerName(
      order.customerName ||
      [order.fName, order.lName].filter(Boolean).join(" ") ||
      "Customer"
    );
    const toEmail = order.email;
    if (!toEmail)
      return res.status(400).json({ message: "No customer email on file" });

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
      bcc: process.env.SUPPORT_BCC,
      subject: `Order Cancellation | ${order.orderNo}`,
      html: `<div style="font-size:16px;line-height:1.7;">
        <p>I hope this email finds you well. I am writing to inform you about the cancellation of your recent order# <b>${order.orderNo}</b>, dated <b>${formattedDate}</b>, for a <b>${order.year} ${order.make}
        ${order.model} ${order.pReq}</b> with <b>50 Stars Auto Parts</b>.</p>
        <p>We regret any inconvenience this may have caused you.</p>
        <p><b>We have cancelled your order and will refund you $${cancelledRefAmount}  to the same source account.</b></p>
        <p>Please call us if you have any questions. Rest assured, any payment made for the cancelled order will be promptly refunded to your original payment method. You can expect to see the refund reflected in your account within 3-5 business days.</p>
        <p>We understand the importance of timely and efficient service, and we sincerely apologize for any inconvenience this cancellation may have caused. Our team is working diligently to prevent such occurrences in the future.</p>
        <p>If you have any questions or require further assistance, please don't hesitate to contact our customer support team at <b>+1(888)-732-8680</b>. We are here to assist you in any way we can. Thank you for your understanding and continued support.</p>
        <p><b>Please reply to this email with a quick confirmation to acknowledge and approve this cancellation request.</b></p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
        <p>${firstName || "Team Member"}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (888) 732-8680<br/>service@50starsautoparts.com<br/>www.50starsautoparts.com</p>
      </div>`,
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

// POST /emails/sendReimburseEmail/:orderNo
router.post("/sendReimburseEmail/:orderNo", async (req, res) => {
  console.log("[emails] sendReimburseEmail hit", req.method, req.originalUrl);
  try {
    const { orderNo } = req.params;
    const reimburesementValue = req.query.reimburesementValue ?? "0";
    const firstName = cleanFirstName(req.query.firstName ?? "");

    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const amount = Number(reimburesementValue) || 0;

    const customerName = cleanCustomerName(
      order.customerName ||
      [order.fName, order.lName].filter(Boolean).join(" ") ||
      "Customer"
    );
    const toEmail = (order.email || "").trim();
    if (!toEmail)
      return res.status(400).json({ message: "No customer email on file" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SERVICE_EMAIL,
        pass: process.env.SERVICE_PASS,
      },
    });

    const logoUrl =
      process.env.LOGO_URL ||
      "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png";

    await transporter.sendMail({
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: toEmail,
      bcc:
        process.env.SUPPORT_BCC ||
        "service@50starsautoparts.com,dipsikha.spotopsdigital@gmail.com",
      subject: `Goodwill Reimbursement Confirmation || Order No. ${orderNo}`,
      html: `<div style="font-size:16px;line-height:1.7;">
  <p>Dear ${customerName},</p>
  <p>We are sorry to hear that the ABS module did not meet your expectations, and we are committed to providing a satisfactory resolution.</p>
  <p>As discussed, we're glad to hear that you've resolved the issue! We are reimbursing you $${amount.toFixed(
    2
  )} as a goodwill gesture, and we hope this reflects our commitment to supporting our customers. Once the refund is processed, we will share the refund receipt with you.</p>
  <p>It's been a pleasure interacting with you, and we look forward to assisting you with more orders in the future.</p>
  <p>Thank you again, and please don't hesitate to reach out anytime.</p>
  <p>If you have any questions or need further assistance, please feel free to reach out.</p>
  <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
  <p>${firstName}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (866) 207-5533<br/>service@50starsautoparts.com<br/>www.50starsautoparts.com</p>
</div>`,
      attachments: [
        {
          filename: "logo.png",
          path: logoUrl,
          cid: "logo",
        },
      ],
    });

    res.json({ message: "Reimbursement email sent successfully" });
  } catch (err) {
    console.error("[emails] sendReimburseEmail error:", err);
    res.status(500).json({ message: "Server error", error: String(err) });
  }
});
router.post("/orders/sendRefundConfirmation/:orderNo", upload.single("pdfFile"), async (req, res) => {
  console.log("[emails] sendRefundConfirmation hit");
  try {
    const { orderNo } = req.params;
    const refundedAmount = req.query.refundedAmount;
    const firstName = cleanFirstName(req.query.firstName);
    if (!firstName) {
      return res.status(400).json({ message: "firstName is required" });
    }

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

    const customerName = cleanCustomerName(
      order.customerName ||
      [order.fName, order.lName].filter(Boolean).join(" ") ||
      "Customer"
    );

    const logoUrl =
      process.env.LOGO_URL ||
      "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png";

    const toEmail = (order.email || "").trim();
    if (!toEmail)
      return res.status(400).json({ message: "No customer email on file" });

    const htmlContent = `<div style="font-size:16px;line-height:1.7;">
        <p>Dear ${customerName},</p>
        <p>We are reaching out to confirm that your refund of <b>$${refundedAmount}</b> for order <b>#${orderNo}</b> has been successfully processed.</p>
        <p>Attached to this email, you'll find a copy of the refund receipt for your records.</p>
        <p>Please allow <b>3–5 business days</b> for the refund to reflect on your original payment method, as processing times may vary based on your financial institution.</p>
        <p>If you have any questions or require further assistance, please feel free to reach out — we're happy to help.</p>
        <p>Thank you for choosing <b>50 Stars Auto Parts</b>. We appreciate your business and look forward to serving you again.</p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
        <p>${firstName}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (866) 207-5533<br/>service@50starsautoparts.com<br/><a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>
      </div>`;

    const mailOptions = {
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: toEmail,
      replyTo: process.env.SERVICE_EMAIL,
      bcc: process.env.SUPPORT_BCC || "service@50starsautoparts.com,dipsikha.spotopsdigital@gmail.com",
      subject: `Refund Processed for Your Order ${orderNo} | 50 Stars Auto Parts`,
      html: htmlContent,
      // Minimal headers to avoid spam triggers
      headers: {
        "X-Mailer": "50 Stars Auto Parts CRM",
      },
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
    const firstName  = cleanFirstName(req.query.firstName ?? req.body?.firstName ?? "");

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


    const customerName = cleanCustomerName(
      order.customerName ||
      [order.fName, order.lName].filter(Boolean).join(" ") ||
      "Customer"
    );
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

    const htmlContent = `<div style="font-size:16px;line-height:1.7;">
        <p>Hi ${customerName},</p>
        <p>We're excited to let you know that your order has been successfully delivered today!</p>
        <p>Thank you so much for choosing 50 Stars Auto Parts. We truly appreciate your trust in us and are grateful for the opportunity to serve you.</p>
        <p>Here's a quick summary of your order:<br>
          <strong>Order Number:</strong> ${orderNo}<br>
          <strong>Tracking No:</strong> ${cxTrackingNo || "—"}<br>
          <strong>Tracking Link:</strong> ${cxShipperName || ""} ${trackingLink ? `- <a href="${trackingLink}" target="_blank" rel="noopener noreferrer">${trackingLink}</a>` : ""}</p>
        <p>If there's anything you need, or if you have any questions about your order, feel free to reach out — we're always happy to help.</p>
        <p>Thanks once again for shopping with us. We look forward to helping you with your auto parts needs in the future!</p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
        <p>${firstName}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (888) 732-8680<br/>service@50starsautoparts.com<br/>www.50starsautoparts.com</p>
      </div>`;

    await transporter.sendMail({
      from: `"50 Stars Auto Parts" <${fromEmail}>`,
      to: toEmail,
      replyTo: fromEmail,
      bcc: bccList,
      subject: `Thank You for Your Order (${orderNo}) – Delivery Confirmation`,
      html: htmlContent,
      // Minimal headers to avoid spam triggers
      headers: {
        "X-Mailer": "50 Stars Auto Parts CRM",
      },
      attachments: [
        { filename: "logo.png", path: logoUrl, cid: "logo" }
      ],
    });

    // Emit websocket event to notify frontend that email was sent
    try {
      const io = req.app.get("io");
      io.to(`order.${orderNo}`).emit("order:msg", {
        orderNo,
        type: "EMAIL_SENT",
        emailType: "delivery",
        yardIndex,
        message: "Customer delivery email sent successfully",
      });
    } catch (wsErr) {
      console.warn("[emails] Failed to emit websocket event:", wsErr);
    }
    
    return res.json({ message: "Customer delivery email sent." });
  } catch (err) {
    console.error("[emails] customer-delivered error:", err);
    res.status(500).json({ message: "Server error", error: String(err?.message || err) });
  }
});

// Helper function to clean customer names (remove excessive repeated characters)
const cleanCustomerName = (name) => {
  if (!name) return "Customer";
  let cleaned = String(name).trim();
  // Remove any excessive repeated characters (like "Dipsikhaaaawwwwwwwwwww")
  cleaned = cleaned.replace(/(.)\1{3,}/g, '$1$1$1'); // Limit to max 3 repeated chars
  return cleaned.trim();
};

// to send tracking info email
router.post("/orders/sendTrackingInfo/:orderNo", async (req, res) => {
  console.log("[emails] sendTrackingInfo hit");
  try {
    const order = await Order.findOne({ orderNo: req.params.orderNo });
    if (!order) return res.status(400).send("Order not found");

    const { trackingNo, eta, shipperName, link, firstName: rawFirstName } = req.body;
    const firstName = cleanFirstName(rawFirstName);
    const customerName = cleanCustomerName(order.customerName || order.fName || "Customer");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SERVICE_EMAIL,
        pass: process.env.SERVICE_PASS,
      },
    });

    const textLines = [
      `Hi ${customerName},`,
      "Your order with 50 Stars Auto Parts has been shipped.",
    ];
    if (shipperName && trackingNo) {
      textLines.push(`Tracking: ${shipperName} - ${trackingNo}`);
    } else if (shipperName) {
      textLines.push(`Carrier: ${shipperName}`);
    } else if (trackingNo) {
      textLines.push(`Tracking #: ${trackingNo}`);
    }
    if (eta) {
      textLines.push(`ETA: ${eta}`);
    }
    if (link) {
      textLines.push(`Link: ${link}`);
    }
    textLines.push(
      "If you have any questions, contact us at +1 (888) 732-8680 or service@50starsautoparts.com."
    );
    const textBody = textLines.join("\n");

    const htmlSections = [
      `<p>Hi ${customerName},</p>`,
      `<p>This email is regarding the order you placed with <strong>50 Stars Auto Parts</strong>. Below are your tracking details:</p>`,
    ];
    if (shipperName && trackingNo) {
      htmlSections.push(`<p><strong>${shipperName}</strong> – ${trackingNo}</p>`);
    } else if (shipperName) {
      htmlSections.push(`<p><strong>Carrier:</strong> ${shipperName}</p>`);
    } else if (trackingNo) {
      htmlSections.push(`<p><strong>Tracking #:</strong> ${trackingNo}</p>`);
    }
    if (eta) {
      htmlSections.push(`<p><strong>ETA (YYYY-MM-DD):</strong> ${eta}</p>`);
    }
    if (link) {
      htmlSections.push(
        `<p><strong>Tracking Link:</strong> <a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a></p>`
      );
    }
    htmlSections.push(
      "<p>Please note: If the ETA is not updated yet, it may take up to 24 hours to appear on the carrier’s site.</p>"
    );
    htmlSections.push("<p>Feel free to call us if you have any questions.</p>");
    htmlSections.push(
      `<p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>`
    );
    htmlSections.push(
      `<p>${firstName}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (888) 732-8680<br/>service@50starsautoparts.com<br/><a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>`
    );
    const htmlBody = `<div style="font-size:16px;line-height:1.7;">${htmlSections.join("\n")}</div>`;

    const mailOptions = {
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: order.email,
      replyTo: process.env.SERVICE_EMAIL,
      bcc: "dipsikha.spotopsdigital@gmail.com",
      subject: `Tracking Details / Order No. ${req.params.orderNo}`,

      // Add plain-text version (boosts deliverability)
      text: textBody,

      // Simple HTML without complex styling that triggers spam filters
      html: htmlBody,
      // Minimal headers to avoid spam triggers
      headers: {
        "X-Mailer": "50 Stars Auto Parts CRM",
      },

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
    console.log("[emails] Tracking email sent successfully.");
    
    // Emit websocket event to notify frontend that email was sent
    try {
      const io = req.app.get("io");
      const yardIndex = req.body.yardIndex || 1;
      const orderNo = req.params.orderNo;
      console.log("[emails] Emitting EMAIL_SENT event for order:", orderNo, "yardIndex:", yardIndex);
      io.to(`order.${orderNo}`).emit("order:msg", {
        orderNo,
        type: "EMAIL_SENT",
        emailType: "tracking",
        yardIndex,
        message: "Tracking email sent successfully",
      });
      console.log("[emails] EMAIL_SENT event emitted successfully");
    } catch (wsErr) {
      console.error("[emails] Failed to emit websocket event:", wsErr);
      // Still return success even if websocket fails
    }
    
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
    let { firstName: rawFirstName, yardIndex, refundReason, returnTracking, refundToCollect, shipper } = req.query;
    const firstName = cleanFirstName(rawFirstName);


    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const idx0 = parseInt(yardIndex ?? 1, 10) - 1;
    const yard = order.additionalInfo?.[idx0];
    if (!yard) return res.status(400).json({ message: `Yard ${yardIndex} not found` });

    const pdfFile = req.file;
    if (!pdfFile) return res.status(400).send("No PDF file uploaded");

    const purchaseEmail = process.env.PURCHASE_EMAIL?.trim();
    const purchasePass = process.env.PURCHASE_PASS?.trim();

    if (!purchaseEmail || !purchasePass) {
      console.error("[emails] PURCHASE_EMAIL or PURCHASE_PASS not set in environment");
      return res.status(500).json({ message: "Email configuration missing" });
    }

    console.log("[emails] Using PURCHASE_EMAIL:", purchaseEmail);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: purchaseEmail,
        pass: purchasePass,
      },
    });

    const yardAgent = yard.agentName || "Yard";
    const partPrice = parseFloat(yard.partPrice ?? 0);
    // Extract numeric value from shippingDetails (handles both "Own shipping: X" and "Yard shipping: X")
    const shippingDetails = yard.shippingDetails || "";
    let shippingValueYard = 0;
    if (shippingDetails) {
      const match = shippingDetails.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
      if (match) {
        shippingValueYard = parseFloat(match[1]) || 0;
      }
    }
    // Note: shippingValueYard is already extracted above using the regex match
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

    const fromAddress = `"Auto Parts Group Corp" <${purchaseEmail}>`;
    console.log("[emails] Sending refund email from:", fromAddress);

    const mailOptions = {
      from: fromAddress,
      to: yardEmail,
      bcc: `dipsikha.spotopsdigital@gmail.com,purchase@auto-partsgroup.com`,
      subject: `Request for Yard Refund | ${order.orderNo}`,
      html: `<div style="font-size:16px;line-height:1.7;">
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
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
        <p>${firstName}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (866) 207-5533<br/>service@50starsautoparts.com<br/><a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>
      </div>`,
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

/* ---------------- Replacement Emails ---------------- */
router.post("/orders/sendReplaceEmailCustomerShipping/:orderNo", async (req, res) => {
  try {
    const { orderNo } = req.params;
    const firstName = cleanFirstName(
      (req.query.firstName ?? req.body?.firstName ?? "Customer Success Team")
        .toString()
        .trim() || "Customer Success Team"
    );
    const retAddressReplacement = (req.query.retAddressReplacement ?? "").toString();
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(400).json({ message: "Order not found" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SERVICE_EMAIL,
        pass: process.env.SERVICE_PASS,
      },
    });

    // Format address with commas: "Address, City, State, Zip"
    // Parse: "Y1 S Address Dallas TX 75227" -> "Y1 S Address, Dallas, TX, 75227"
    const parts = retAddressReplacement.trim().split(/\s+/).filter(Boolean);
    let formattedAddress = retAddressReplacement;
    if (parts.length >= 4) {
      // Find state (2 letters) and zip (5 digits) from the end
      const lastTwo = parts.slice(-2);
      const stateMatch = lastTwo[0]?.match(/^[A-Z]{2}$/i);
      const zipMatch = lastTwo[1]?.match(/^\d{5}$/);
      if (stateMatch && zipMatch) {
        // Format: [address parts], [city], [state], [zip]
        const addressParts = parts.slice(0, -3).join(" ");
        const city = parts[parts.length - 3];
        const state = parts[parts.length - 2];
        const zip = parts[parts.length - 1];
        formattedAddress = `${addressParts}, ${city}, ${state}, ${zip}`;
      }
    }
    const customerName = cleanCustomerName(order.customerName || order.fName || "Customer");
    const bccList =
      process.env.SUPPORT_BCC ||
      "service@50starsautoparts.com,dipsikha.spotopsdigital@gmail.com";
    const logoUrl =
      process.env.LOGO_URL ||
      "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png";

    const mailOptions = {
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: order.email,
      bcc: bccList,
      subject: `Return Required for Replacement of ABS Module Order | Order ${orderNo}`,
      html: `<div style="font-size:16px;line-height:1.7;">
        <p>Dear ${customerName},</p>
        <p>We are sorry to hear that there was an issue with the ABS module you received. We are happy to offer a replacement to ensure you receive a fully functional part.</p>
        <p>Please return the part to the following address:</p>
        <p>${formattedAddress}</p>
        <p>Please note that the shipping costs for the return are your responsibility. Once we receive the part, we will process and ship out the replacement within 1-3 business days. We will notify you with tracking information once the replacement part is on its way.</p>
        <p>If you have any questions about the process or need further assistance, please feel free to contact us.</p>
        <p>Thank you for giving us an opportunity to make this right.</p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
        <p>${firstName}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (866) 207-5533<br/>service@50starsautoparts.com<br/><a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>
      </div>`,
      attachments: [
        {
          filename: "logo.png",
          path: logoUrl,
          cid: "logo",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Replacement email (customer shipping) sent successfully." });
  } catch (error) {
    console.error("[emails] sendReplaceEmailCustomerShipping error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post(
  "/orders/sendReplaceEmailOwn_Yard/:orderNo",
  upload.single("pdfFile"),
  async (req, res) => {
    try {
      const { orderNo } = req.params;
      const firstName = cleanFirstName(
        (req.query.firstName ?? req.body?.firstName ?? "Customer Success Team")
          .toString()
          .trim() || "Customer Success Team"
      );

      if (!req.file) {
        return res.status(400).json({ message: "Attach the required document (pdfFile)." });
      }

      const order = await Order.findOne({ orderNo });
      if (!order) return res.status(400).json({ message: "Order not found" });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.SERVICE_EMAIL,
          pass: process.env.SERVICE_PASS,
        },
      });

      const customerName = order.customerName || order.fName || "Customer";
      const bccList =
        process.env.SUPPORT_BCC ||
        "service@50starsautoparts.com,dipsikha.spotopsdigital@gmail.com";
      const logoUrl =
        process.env.LOGO_URL ||
        "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png";

      const mailOptions = {
        from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
        to: order.email,
        bcc: bccList,
        subject: `Replacement Instructions & Shipping Document | Order ${orderNo}`,
        html: `<div style="font-size:16px;line-height:1.7;">
          <p>Dear ${customerName},</p>
          <p>Please find the attached shipping document for the replacement of your part. Kindly print and include it with the package when it is handed over to the carrier.</p>
          <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
          <p>${firstName}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (866) 207-5533<br/>service@50starsautoparts.com<br/><a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>
        </div>`,
        attachments: [
          {
            filename: req.file.originalname || "replacement.pdf",
            content: req.file.buffer,
          },
          {
            filename: "logo.png",
            path: logoUrl,
            cid: "logo",
          },
        ],
      };

      await transporter.sendMail(mailOptions);
      res.json({ message: "Replacement email (own/yard shipping) sent successfully." });
    } catch (error) {
      console.error("[emails] sendReplaceEmailOwn_Yard error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

/* ---------------- Return Emails ---------------- */
router.post("/orders/sendReturnEmailCustomerShipping/:orderNo", async (req, res) => {
  try {
    const { orderNo } = req.params;
    const firstName = cleanFirstName(
      (req.query.firstName ?? req.body?.firstName ?? "Customer Success Team")
        .toString()
        .trim() || "Customer Success Team"
    );
    const retAddress = (req.query.retAddress ?? "").toString();

    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(400).json({ message: "Order not found" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SERVICE_EMAIL,
        pass: process.env.SERVICE_PASS,
      },
    });

    // Format address with commas: "Address, City, State, Zip"
    // Parse: "Y1 S Address Dallas TX 75227" -> "Y1 S Address, Dallas, TX, 75227"
    const parts = retAddress.trim().split(/\s+/).filter(Boolean);
    let formattedAddress = retAddress;
    if (parts.length >= 4) {
      // Find state (2 letters) and zip (5 digits) from the end
      const lastTwo = parts.slice(-2);
      const stateMatch = lastTwo[0]?.match(/^[A-Z]{2}$/i);
      const zipMatch = lastTwo[1]?.match(/^\d{5}$/);
      if (stateMatch && zipMatch) {
        // Format: [address parts], [city], [state], [zip]
        const addressParts = parts.slice(0, -3).join(" ");
        const city = parts[parts.length - 3];
        const state = parts[parts.length - 2];
        const zip = parts[parts.length - 1];
        formattedAddress = `${addressParts}, ${city}, ${state}, ${zip}`;
      }
    }
    const customerName = cleanCustomerName(order.customerName || order.fName || "Customer");
    const bccList =
      process.env.SUPPORT_BCC ||
      "service@50starsautoparts.com,dipsikha.spotopsdigital@gmail.com";
    const logoUrl =
      process.env.LOGO_URL ||
      "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png";

    const mailOptions = {
      from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
      to: order.email,
      bcc: bccList,
      subject: `Return Instructions for Your Order ${orderNo}`,
      html: `<div style="font-size:16px;line-height:1.7;">
        <p>Dear ${customerName},</p>
        <p>Please ship the part back to the following address so we can continue processing your return:</p>
        <p>${formattedAddress}</p>
        <p>Kindly share the tracking number once the package is on its way. As soon as we receive and inspect the part, we will continue with the necessary next steps.</p>
        <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
        <p>${firstName}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (866) 207-5533<br/>service@50starsautoparts.com<br/><a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>
      </div>`,
      attachments: [
        {
          filename: "logo.png",
          path: logoUrl,
          cid: "logo",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Return email (customer shipping) sent successfully." });
  } catch (error) {
    console.error("[emails] sendReturnEmailCustomerShipping error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post(
  "/orders/sendReturnEmailOwn_Yard/:orderNo",
  upload.single("pdfFile"),
  async (req, res) => {
    try {
      const { orderNo } = req.params;
      const firstName = cleanFirstName(
        (req.query.firstName ?? req.body?.firstName ?? "Customer Success Team")
          .toString()
          .trim() || "Customer Success Team"
      );
      const retAddress = (req.query.retAddress ?? "").toString();

      if (!req.file) {
        return res.status(400).json({ message: "Attach the required document (pdfFile)." });
      }

      const order = await Order.findOne({ orderNo });
      if (!order) return res.status(400).json({ message: "Order not found" });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.SERVICE_EMAIL,
          pass: process.env.SERVICE_PASS,
        },
      });

      // Format address with commas: "Address, City, State, Zip"
      const formattedAddress = retAddress
        .split(/\s+/)
        .filter(Boolean)
        .join(", ");
      const customerName = order.customerName || order.fName || "Customer";
      const bccList =
        process.env.SUPPORT_BCC ||
        "service@50starsautoparts.com,dipsikha.spotopsdigital@gmail.com";
      const logoUrl =
        process.env.LOGO_URL ||
        "https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/logo.png";

      const mailOptions = {
        from: `"50 Stars Auto Parts" <${process.env.SERVICE_EMAIL}>`,
        to: order.email,
        bcc: bccList,
        subject: `Return Instructions & Shipping Document | Order ${orderNo}`,
        html: `<div style="font-size:16px;line-height:1.7;">
          <p>Dear ${customerName},</p>
          <p>Please find the attached shipping document for the return of your part. Kindly attach it to the package before handing it over to the carrier.</p>
          <p>Return Address: ${formattedAddress}</p>
          <p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>
          <p>${firstName}<br/>Customer Service Team<br/>50 STARS AUTO PARTS<br/>+1 (866) 207-5533<br/>service@50starsautoparts.com<br/><a href="https://www.50starsautoparts.com">www.50starsautoparts.com</a></p>
        </div>`,
        attachments: [
          {
            filename: req.file.originalname || "return-label.pdf",
            content: req.file.buffer,
          },
          {
            filename: "logo.png",
            path: logoUrl,
            cid: "logo",
          },
        ],
      };

      await transporter.sendMail(mailOptions);
      res.json({ message: "Return email (own/yard shipping) sent successfully." });
    } catch (error) {
      console.error("[emails] sendReturnEmailOwn_Yard error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);


export default router;

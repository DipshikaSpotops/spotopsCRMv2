import express from "express";
import puppeteer from "puppeteer";
import { getOrderModelForBrand } from "../models/Order.js";
import { fetchDrivingLicenseAttachmentBuffer } from "../services/s3Upload.js";
import nodemailer from "nodemailer";
import moment from "moment-timezone";
import multer from "multer";
import dotenv from "dotenv";
import { execSync } from "child_process";
import { getPurchaseBcc } from "../utils/purchaseBcc.js";
import {
  emailLogoHtml,
  logoForYardFacingEmail,
  resolveBrandFromOrderNo,
  withEmailLogoAttachment,
} from "../utils/emailLogos.js";
dotenv.config();

/**
 * Environment Variables:
 * - CHROMIUM_PATH: (Optional) Path to system Chromium/Chrome executable
 *   Example: /usr/bin/chromium-browser
 *   If not set, will try to auto-detect, or use Puppeteer's bundled Chrome
 *   Note: Puppeteer's bundled Chrome requires additional system dependencies
 */


// --- Brand-aware email config helpers (50STARS / PROLANE / PROTP) ---
function getBrand(req) {
  const b = String(req.brand || "").toUpperCase();
  if (b === "PROLANE" || b === "PROTP") return b;
  return "50STARS";
}

function pickEnv(baseKey, brand) {
  if (!baseKey) return "";
  const base = String(baseKey).trim();
  if (!base) return "";

  // PROTP shares credentials with PROLANE
  const envBrand = brand === "PROTP" ? "PROLANE" : brand;
  if (envBrand === "PROLANE") {
    const brandKey = `${base}_PROLANE`;
    if (process.env[brandKey]) return process.env[brandKey];
  }
  return process.env[base] || "";
}

// Card details used on the PO PDF:
// - 50STARS: NEW_CARD_NUMBER / NEW_CARD_EXPIRY / NEW_CVV
// - PROLANE/PROTP: PROLANE_CARD_NUMBER / PROLANE_CARD_EXPIRY / PROLANE_CVV
function getCardConfig(req) {
  const brand = getBrand(req);

  if (brand === "PROLANE" || brand === "PROTP") {
    return {
      cardNumber: process.env.PROLANE_CARD_NUMBER || "**** **** **** 0000",
      cardExpiry: process.env.PROLANE_CARD_EXPIRY || "**/**",
      cardCvv: process.env.PROLANE_CVV || "***",
    };
  }

  // Default: 50STARS
  return {
    cardNumber: process.env.NEW_CARD_NUMBER || "**** **** **** 7195",
    cardExpiry: process.env.NEW_CARD_EXPIRY || "**/**",
    cardCvv: process.env.NEW_CVV || "***",
  };
}

function getEmailBrandConfig(req) {
  const brand = getBrand(req);

  let purchaseEmail, purchasePass;
  if (brand === "PROTP") {
    purchaseEmail = process.env.EMAIL_PROLANE_TRUCK || pickEnv("PURCHASE_EMAIL", "PROLANE");
    purchasePass = process.env.PASS_PROLANE_TRUCK || pickEnv("PURCHASE_PASS", "PROLANE");
  } else {
    purchaseEmail = pickEnv("PURCHASE_EMAIL", brand);
    purchasePass = pickEnv("PURCHASE_PASS", brand);
  }

  // Brand-specific company details
  const companyName =
    brand === "PROLANE" || brand === "PROTP" ? "American Auto Supply" : "Auto Parts Group Corp";
  const companyAddress = "5306 Blaney Way, Dallas, Texas, 75227";

  // Phone for PO (purchase-side):
  // - PROTP: fixed number
  // - PROLANE: use PROLANE_PURCHASE_NO if set, else PROLANE_SERVICE_NO, else default
  // - 50STARS: use historical purchase phone
  let companyPhone = "+1 (888) 732-8680";
  if (brand === "PROTP") {
    companyPhone = process.env.PHONE_PROLANE_TRUCK || "+1 (888) 343-7670";
  } else if (brand === "PROLANE") {
    companyPhone =
      process.env.PROLANE_PURCHASE_NO ||
      process.env.PROLANE_SERVICE_NO ||
      "+1 (866) 207-5533";
  }
  const purchaseEmailAddress = brand === "PROTP"
    ? "service@prolanetruckparts.com"
    : brand === "PROLANE"
    ? "purchase@prolaneautoparts.com"
    : "purchase@auto-partsgroup.com";
  return {
    brand,
    purchaseEmail,
    purchasePass,
    companyName,
    companyAddress,
    companyPhone,
    purchaseEmailAddress,
  };
}

// --- Support agent display-name mapping for PROLANE (similar to emails.js) ---
// Spec from user:
//   Jonathan Whitmore - Tristan Brown
//   Justin Time - James Foster
//   Ace Ryder - Jessie Callum
//   Jerry Miller - Peter Adams
//   Luna Brown - Suzanne Brown
//   Rev Rhode - Emily D'souza
//   Gloria Sky - Ashley Williams
//   Nik Lewis - Noah Webster
//   Max Williams - Leo Parker
//   Dips - Dipshika
//
// In our app, we store the 50STARS firstName in localStorage and send it as ?firstName=.
// We map that stored firstName to the PROLANE display name for emails when brand === "PROLANE".
const SUPPORT_AGENT_PROLANE_NAME_MAP = {
  Tristan: "Jonathan Whitmore",
  James: "Justin Time",
  Jessie: "Ace Ryder",
  Hardin  : "Henry Scott",
  Suzanne: "Luna Brown",
  Emily: "Rev Rhode",
  Ashley: "Gloria Sky",
  Nik: "Noah Webster",
  Leo: "Max Williams",
  Tony: "Kevin Wilson",
  Alex: "Jason Morgan",
  Hannah: "Alice Presley",
  Natasha: "Sophia Roberts",
  Stella: "Zoe Harris",
  // Handle both spellings for safety
  Dipshika: "Dips",
  Dipsikha: "Dips",
};

const cleanSupportFirstName = (name) => {
  if (!name) return "Auto Parts Group";
  let cleaned = String(name).trim();
  if (cleaned.includes(",")) {
    const parts = cleaned
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    cleaned = parts[0] || "Auto Parts Group";
  }
  return cleaned;
};

const getSupportDisplayName = (rawFirstName, req) => {
  const cleaned = cleanSupportFirstName(rawFirstName);
  const brand = getBrand(req);
  if (!cleaned) return "Auto Parts Group";

  // For 50STARS keep as-is
  if (brand !== "PROLANE" && brand !== "PROTP") return cleaned;

  const firstToken = cleaned.split(" ")[0];
  return (
    SUPPORT_AGENT_PROLANE_NAME_MAP[firstToken] ||
    SUPPORT_AGENT_PROLANE_NAME_MAP[cleaned] ||
    cleaned
  );
};

/** PO payment: card (default), payment_link, zelle */
function normalizePoPaymentMethod(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (s === "payment_link" || s === "paymentlink") return "payment_link";
  if (s === "zelle") return "zelle";
  return "card";
}

function poPaymentMethodLabel(method) {
  if (method === "payment_link") return "Payment Link";
  if (method === "zelle") return "Zelle";
  return null;
}

const router = express.Router();
const upload = multer();

// Reuse a single Puppeteer browser instance to avoid 15–20s cold start on every PO
let sharedBrowserPromise = null;
async function getBrowser() {
  if (sharedBrowserPromise) return sharedBrowserPromise;

  sharedBrowserPromise = (async () => {
    // Some environments set PUPPETEER_EXECUTABLE_PATH="" which breaks launch.
    const execEnv = (process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
    if (!execEnv) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const launchOptions = {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    };

    console.log("[sendPO] Launching shared Puppeteer browser");
    return puppeteer.launch(launchOptions);
  })();

  try {
    return await sharedBrowserPromise;
  } catch (err) {
    // If launch fails, clear promise so we can retry on next call
    sharedBrowserPromise = null;
    throw err;
  }
}

// Send PO route
router.post("/sendPOEmailYard/:orderNo", upload.any(), async (req, res) => {
  try {
    const { orderNo } = req.params;
    const firstName = req.query.firstName;
    if (!firstName) {
      return res.status(400).json({ message: "firstName is required" });
    }

    const yardIndex = parseInt(req.body.yardIndex, 10);
    console.log(`[sendPO] Sending PO for order ${orderNo}, yard index ${yardIndex}, brand: ${req.brand || "50STARS"}`);
    
    if (isNaN(yardIndex) || yardIndex < 0) {
      console.error("[sendPO] Invalid yardIndex:", req.body.yardIndex);
      return res.status(400).json({ message: "Invalid yard index" });
    }

    const brand = resolveBrandFromOrderNo(orderNo, getBrand(req));

    // Get brand-aware config
    const brandConfig = getEmailBrandConfig({ ...req, brand });
    const yardEmailLogo = logoForYardFacingEmail(brand);

    // Use brand-aware model
    const Order = getOrderModelForBrand(brand);
    const order = await Order.findOne({ orderNo });
    if (!order) {
      console.error("[sendPO] Order not found:", orderNo, "in brand:", req.brand || "50STARS");
      return res.status(404).json({ message: "Order not found" });
    }

    if (!order.additionalInfo || !Array.isArray(order.additionalInfo) || !order.additionalInfo[yardIndex]) {
      console.error("[sendPO] Invalid yard index:", yardIndex, "for order:", orderNo);
      return res.status(400).json({ message: "Invalid yard index" });
    }
    
    const yard = order.additionalInfo[yardIndex];

    const yardEmail = (yard.email || "").trim();
    if (!yardEmail) {
      return res.status(200).json({ message: "No yard email provided. PO not sent." });
    }

    // Calculate prices
    const partPrice = parseFloat(yard.partPrice) || 0;
    // Extract numeric value from shippingDetails (handles both "Own shipping: X" and "Yard shipping: X")
    let shipping = 0;
    let shippingValue = "Included";
    if (yard.shippingDetails) {
      const shippingDetailsStr = yard.shippingDetails;
      const isOwnShipping = /own shipping:/i.test(shippingDetailsStr);
      const isYardShipping = /yard shipping:/i.test(shippingDetailsStr);
      const match = shippingDetailsStr.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
      
      if (isOwnShipping) {
        // If it's "Own shipping", always show the label regardless of value
        shippingValue = `Own Shipping (${brandConfig.companyName})`;
        if (match) {
          shipping = parseFloat(match[1]) || 0;
        }
      } else if (isYardShipping && match) {
        // If it's "Yard shipping", extract the value
        shipping = parseFloat(match[1]) || 0;
        shippingValue = shipping === 0 ? "Included" : `$${shipping.toFixed(2)}`;
      }
    } else {
      shippingValue = `Own Shipping (${brandConfig.companyName})`;
    }
    const subtotal = partPrice;
    const grandTotal = subtotal + shipping;

    // Warranty display helper (uses yardWarrantyField: days/months/years)
    const warrantyValue = yard.warranty;
    const warrantyUnitRaw = (yard.yardWarrantyField)
      .toString()
      .toLowerCase();

    const getWarrantyUnitLabel = () => {
      const n = Number(warrantyValue) || 0;
      if (warrantyUnitRaw === "months") {
        return n === 1 ? "Month" : "Months";
      }
      if (warrantyUnitRaw === "years") {
        return n === 1 ? "Year" : "Years";
      }
      // default days
      return n === 1 ? "Day" : "Days";
    };

    const warrantyDisplay =
      warrantyValue === undefined || warrantyValue === null || warrantyValue === ""
        ? "NA"
        : `${warrantyValue} ${getWarrantyUnitLabel()}`;

    const paymentMethod = normalizePoPaymentMethod(req.body.paymentMethod);
    const isCardPayment = paymentMethod === "card";
    const paymentMethodLabel = poPaymentMethodLabel(paymentMethod);

    const sendDrivingLicense =
      req.body.sendDrivingLicense === "true" ||
      req.body.sendDrivingLicense === true;

    // Brand-aware card details for the PDF (blank when not paying by card)
    const cardConfig = getCardConfig(req);
    const card = isCardPayment
      ? cardConfig
      : { cardNumber: "", cardExpiry: "", cardCvv: "" };

    const cardChargeFooterLine = isCardPayment
      ? '- Charging the card confirms agreement with our T&Cs.<br>'
      : "";

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
        font-size: 16px;
        line-height: 1.7;
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
      body {
        font-size: 16px;
        line-height: 1.7;
      }
      .footer-note {
        margin-top: 20px;
        color: #0b2545;
        font-size: 14px;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div>
      <div class="header">
        ${brandConfig.companyName}
        <div>${brandConfig.companyAddress}</div>
        <div>${brandConfig.companyPhone} | ${brandConfig.purchaseEmailAddress}</div>
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
          <p>${brandConfig.companyName}<br>${brandConfig.companyAddress}<br>${brandConfig.purchaseEmailAddress}<br>${brandConfig.companyPhone}</p>
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
      Warranty: ${warrantyDisplay}
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
        <tr><td class="label">Card Number:</td><td>${card.cardNumber}</td></tr>
<tr><td class="label">Expiration Date:</td><td>${card.cardExpiry}</td></tr>
<tr><td class="label">CVV:</td><td>${card.cardCvv}</td></tr>

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
        - Send pictures to ${brandConfig.purchaseEmailAddress} before shipping.<br>
        - Pack the part carefully. We are not accountable for shipping damage.<br>
        - Ensure "No Tags or Labels" — this is blind shipping.<br>
        - Send tracking and carrier info to our email.<br>
        ${cardChargeFooterLine}
      </div>
    </div>
  </body>
</html>
`;

    // Generate PDF
    let pdfBuffer;
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      // For static HTML this is enough and a bit faster than waiting for networkidle0
      await page.setContent(html, { waitUntil: "load" });
      pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      await page.close();
    } catch (puppeteerErr) {
      console.error("[sendPO] Puppeteer error:", puppeteerErr);
      // If browser is in a bad state, reset so it can be relaunched on next request
      sharedBrowserPromise = null;
      return res.status(500).json({
        message: "Failed to generate PDF",
        error: puppeteerErr.message,
      });
    }

    // Send email - use brand-aware config
    const { purchaseEmail, purchasePass } = brandConfig;

    if (!purchaseEmail || !purchasePass) {
      console.error("[sendPO] PURCHASE_EMAIL or PURCHASE_PASS not set in environment for brand:", brandConfig.brand);
      return res.status(500).json({ message: "Email configuration missing" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: purchaseEmail, pass: purchasePass },
    });

    const attachments = [
      { filename: `${order.orderNo}-PO.pdf`, content: pdfBuffer },
      ...req.files.map((file, index) => ({
        filename: file.originalname || `attachment-${index + 1}`,
        content: file.buffer,
      })),
    ];

    if (sendDrivingLicense) {
      try {
        const dlBuffer = await fetchDrivingLicenseAttachmentBuffer();
        attachments.push({
          filename: "Driving-License-Salomon-Rodriguez.png",
          content: dlBuffer,
          contentType: "image/png",
        });
      } catch (dlErr) {
        console.error("[sendPO] Driving license fetch failed:", dlErr);
        return res.status(400).json({
          message:
            dlErr?.message ||
            "Driving license image could not be loaded. PO was not sent.",
        });
      }
    }

    const { year, make, model, pReq, desc, vin, partNo, attention, fName, lName } =
      order;

    const stockNo = yard.stockNo || "NA";
    // Brand-aware support display name for signature
    const firstNameTrimmed = getSupportDisplayName(firstName, req);

    const paymentMethodListItem = paymentMethodLabel
      ? `<li><strong>Payment method:</strong> ${paymentMethodLabel}</li>`
      : "";

    const poNotesBlock = isCardPayment
      ? `Please provide the transaction receipt after you have charged our card.<br>
          Also, make sure it's blind shipping, and don't add any tags or labels during the shipment.<br>
          Please ensure that the items are delivered as specified above and in accordance with the agreed-upon terms and conditions.<br>
          If there are any discrepancies or questions regarding this order, please contact us immediately.`
      : `Payment is to be made via <strong>${paymentMethodLabel}</strong>. Card details are not included on the attached PO.<br>
          Also, make sure it's blind shipping, and don't add any tags or labels during the shipment.<br>
          Please ensure that the items are delivered as specified above and in accordance with the agreed-upon terms and conditions.<br>
          If there are any discrepancies or questions regarding this order, please contact us immediately.`;

    const htmlContent = `
        <p style="font-size: 14px;">Dear ${yard.agentName || "Team"},</p>
        <p style="font-size: 14px;">Please find attached the Purchase Order for the following:</p>
        <ul style="font-size: 14px;">
          <li><strong>Order No:</strong> ${orderNo}</li>
          <li><strong>Year/Make/Model:</strong> ${year} ${make} ${model}</li>
          <li><strong>Part:</strong> ${pReq}</li>
          <li><strong>Description:</strong> ${desc}</li>
          <li><strong>VIN:</strong> ${vin || "NA"}</li>
          <li><strong>Part No:</strong> ${partNo || "NA"}</li>
          <li><strong>Stock No:</strong> ${stockNo}</li>
          <li><strong>Warranty:</strong> ${warrantyDisplay}</li>
          ${paymentMethodListItem}
        </ul>
        <p><strong>Purchase Order To:</strong> ${yard.yardName}<br>
        <strong>Part Price:</strong> $${partPrice.toFixed(2)}<br>
        <strong>Shipping:</strong> ${shippingValue}</p>

        <p style="font-size: 14px;">
          Notes:<br>
          ${poNotesBlock}
        </p>

        <p>
          <strong style="background-color: #ffff00; font-size: 20px; color: black; font-weight: bold; padding: 4px; display: inline-block;margin-bottom:4px;">
            NOTE: BLIND SHIPPING
          </strong><br>
          <strong style="background-color: #ff0000; font-size: 20px; color: black; font-weight: bold; padding: 4px; display: inline-block;margin-bottom:4px;">
            NOTE: PROVIDE PICTURES BEFORE SHIPPING
          </strong>
        </p>

        ${emailLogoHtml(yardEmailLogo)}
        <p style="font-size: 16px;">
          ${firstNameTrimmed}<br>
          ${brandConfig.companyName}<br>
          ${brandConfig.companyPhone} | ${brandConfig.purchaseEmailAddress}
        </p>
      `;

    try {
      await transporter.sendMail({
      from: `"${brandConfig.companyName}" <${purchaseEmail}>`,
      to: yardEmail,
      replyTo: purchaseEmail,
      bcc: getPurchaseBcc(req),
      subject: `Purchase Order | ${order.orderNo} | ${year} ${make} ${model} | ${pReq}`,
      html: htmlContent,
      // Minimal headers to avoid spam triggers
      headers: {
        "X-Mailer": `${brandConfig.companyName} CRM`,
      },
      attachments: withEmailLogoAttachment(yardEmailLogo, attachments),
    });
    } catch (emailErr) {
      console.error("[sendPO] Email sending error:", emailErr);
      return res.status(500).json({ 
        message: "Failed to send email", 
        error: emailErr.message 
      });
    }

    // Update DB
    const nowDallas = moment().tz("America/Chicago");
const isoDallas = nowDallas.toDate(); // 2024-11-12T18:19:23.764+00:00
const formattedDate = nowDallas.format("DD MMM, YYYY HH:mm");

const yardLabel = `Yard ${yardIndex + 1}`;

// Update yard status and add poSentDate
order.additionalInfo[yardIndex].status = "Yard PO Sent";
order.additionalInfo[yardIndex].poSentDate = isoDallas;
if (sendDrivingLicense) {
  order.additionalInfo[yardIndex].sentDL = true;
}

// ensure notes array exists
order.additionalInfo[yardIndex].notes = order.additionalInfo[yardIndex].notes || [];

// Normalize firstName to avoid duplicates like "Tristan,Tristan"
let firstNameStr = getSupportDisplayName(firstName, req);
if (firstNameStr.includes(",")) {
  const parts = firstNameStr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  firstNameStr = [...new Set(parts)].join(", ");
}

const dlNote = sendDrivingLicense ? " (driving license attached)" : "";
order.additionalInfo[yardIndex].notes.push(
  `${yardLabel} PO sent by ${firstNameStr} on ${formattedDate}${dlNote}`
);

// Update main order fields
order.orderStatus = "Yard Processing";
order.orderHistory.push(
  `${yardLabel} PO sent by ${firstNameStr} on ${formattedDate}`
);

    await order.save();

    // Emit websocket event to notify frontend of status change
    try {
      const io = req.app.get("io");
      if (io) {
        io.to(`order.${orderNo}`).emit("order:msg", {
          type: "STATUS_CHANGED",
          orderNo,
          yardIndex: yardIndex + 1,
          status: "Yard PO Sent",
          orderStatus: "Yard Processing",
        });
      }
    } catch (wsErr) {
      console.warn("[sendPO] Failed to emit websocket event:", wsErr);
    }

    res.json({ message: "PO email sent and status updated" });
  } catch (err) {
    console.error("[sendPO] Error sending PO:", err);
    console.error("[sendPO] Error stack:", err.stack);
    res.status(500).json({ 
      message: "Failed to send PO", 
      error: err.message,
      details: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }
});

export default router;

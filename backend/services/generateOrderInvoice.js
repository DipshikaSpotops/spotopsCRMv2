import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";
import { uploadInvoicePdfToS3 } from "./s3Upload.js";
import {
  decryptSecret,
  digitsOnly,
  maskCardNumber,
} from "../utils/cardSecrets.js";
import { resolveCustomerLogoUrl, resolveBrandFromOrderNo } from "../utils/emailLogos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_INVOICE_DIR = path.join(__dirname, "..", "uploads", "invoices");

let sharedBrowserPromise = null;

async function getBrowser() {
  if (sharedBrowserPromise) return sharedBrowserPromise;

  sharedBrowserPromise = (async () => {
    const execEnv = (process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
    if (!execEnv) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    return puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
      ],
    });
  })();

  try {
    return await sharedBrowserPromise;
  } catch (err) {
    sharedBrowserPromise = null;
    throw err;
  }
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function customerDisplayName(order) {
  return (
    String(order.customerName || "").trim() ||
    `${order.fName || ""} ${order.lName || ""}`.trim() ||
    String(order.bName || order.businessName || "").trim() ||
    ""
  );
}

function formatWarranty(order) {
  if (order.warranty == null || String(order.warranty).trim() === "") return "NA";
  const qty = String(order.warranty).trim();
  let unit = String(order.warrantyField || "days").trim().toLowerCase();
  if (unit === "day") unit = "Days";
  else if (unit === "days") unit = "Days";
  else if (unit === "month") unit = "Months";
  else if (unit === "months") unit = "Months";
  else if (unit === "year") unit = "Year";
  else if (unit === "years") unit = "Years";
  else unit = unit.charAt(0).toUpperCase() + unit.slice(1);
  return `${qty} ${unit}`;
}

function shipAddressBlock(order) {
  const lines = [
    order.attention || customerDisplayName(order),
    order.businessName && order.businessName !== order.attention ? order.businessName : "",
    order.sAddressStreet,
    [order.sAddressCity, order.sAddressState, order.sAddressZip].filter(Boolean).join(", "),
    order.sAddressAcountry,
  ].filter(Boolean);
  return lines.map(esc).join("<br/>");
}

function billAddressBlock(order) {
  const name = order.bName || order.businessName || customerDisplayName(order);
  const lines = [
    name,
    order.bAddressStreet,
    [order.bAddressCity, order.bAddressState, order.bAddressZip].filter(Boolean).join(", "),
    order.bAddressAcountry,
  ].filter(Boolean);
  return lines.map(esc).join("<br/>");
}

function brandConfig(brand) {
  const b = String(brand || "50STARS").toUpperCase();
  if (b === "PROLANE" || b === "PROTP") {
    const isTruck = b === "PROTP";
    return {
      brand: b,
      companyName: isTruck ? "Prolane Truck Parts" : "Prolane Auto Parts",
      companyNameUpper: isTruck ? "PROLANE TRUCK PARTS" : "PROLANE AUTO PARTS",
      addressLine: "1722 Routh St Suite 900, Dallas, TX 75201",
      authAddressLine: "7250 Dallas Pkwy Suite 400 Legacy Tower, Plano, TX, 75024",
      phone: isTruck
        ? process.env.PHONE_PROLANE_TRUCK || "+1 (888) 343-7670"
        : process.env.PROLANE_SERVICE_NO || "+1 (866) 207-5533",
      website: isTruck ? "www.prolanetruckparts.com" : "www.prolaneautoparts.com",
      useTax: false,
      processingRate: 0.0399,
      authorizeAs: isTruck ? "Prolane Truck Parts" : "Prolane Auto Parts",
      legalEntityShort: isTruck ? "Prolane Truck Parts" : "Prolane Auto Parts",
    };
  }
  return {
    brand: "50STARS",
    companyName: "50 Stars Auto Parts",
    companyNameUpper: "50 STARS AUTO PARTS",
    addressLine: "910 S. Pearl Expressway, Dallas, Texas, 75201",
    authAddressLine: "910 S. Pearl Expressway, Dallas, Texas, 75201",
    phone: "(469) 694-3462",
    website: "www.50starsautoparts.com",
    useTax: true,
    processingRate: 0,
    authorizeAs: "50 Stars Auto Parts",
    legalEntityShort: "50 Stars Auto Parts",
  };
}

function sharedStyles() {
  return `
  @page { size: Letter; margin: 0.4in 0.55in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 10px;
    line-height: 1.35;
  }
  .page {
    page-break-after: always;
    height: 10.1in;
    max-height: 10.1in;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0 10px;
  }
  .page:last-child { page-break-after: auto; }
  .page-main { flex: 1 1 auto; min-height: 0; overflow: hidden; }
  .page-bottom { flex: 0 0 auto; margin-top: auto; padding-top: 10px; }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6px;
  }
  .brand-block { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
  .logo { max-width: 130px; max-height: 46px; object-fit: contain; }
  .brand-name {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .invoice-title { text-align: right; min-width: 200px; }
  .invoice-title h1 {
    margin: 0;
    font-size: 26px;
    letter-spacing: 2px;
    font-weight: 800;
    line-height: 1;
  }
  .invoice-title .meta { margin-top: 5px; font-size: 10px; text-align: left; display: inline-block; }
  .invoice-title .meta div { margin-bottom: 1px; }
  .cols {
    display: flex;
    width: 100%;
    border: 1px solid #111;
    margin-bottom: 6px;
  }
  .cols .col { flex: 1; padding: 6px 9px; min-height: 54px; }
  .cols .col + .col { border-left: 1px solid #111; }
  .cols .label {
    font-weight: 800;
    font-size: 11px;
    margin-bottom: 3px;
    padding-bottom: 2px;
    border-bottom: 1px solid #bbb;
  }
  table.parts { width: 100%; border-collapse: collapse; margin-top: 0; }
  table.parts th, table.parts td {
    border: 1px solid #111;
    padding: 6px 8px;
    vertical-align: top;
  }
  table.parts th {
    background: #efefef;
    text-align: left;
    font-size: 10px;
    font-weight: 800;
  }
  table.parts .amt {
    width: 90px;
    text-align: right;
    font-weight: 800;
    font-size: 11px;
    white-space: nowrap;
  }
  .part-lines div { margin-bottom: 1px; }
  .mid-row {
    display: flex;
    gap: 10px;
    margin-top: 6px;
    align-items: stretch;
  }
  .remarks {
    flex: 1;
    border: 1px solid #111;
    padding: 6px 8px;
    font-size: 9px;
    line-height: 1.35;
  }
  .remarks .title { font-weight: 800; margin-bottom: 3px; }
  .remarks div { margin-bottom: 2px; }
  .totals {
    width: 200px;
    border: 1px solid #111;
    border-collapse: collapse;
    align-self: flex-start;
  }
  .totals td {
    padding: 5px 7px;
    border-bottom: 1px solid #ccc;
    font-size: 10px;
  }
  .totals tr:last-child td { border-bottom: none; font-weight: 800; }
  .totals .lbl { font-weight: 700; width: 58%; }
  .totals .val { text-align: right; white-space: nowrap; }
  .totals tr.note td { font-weight: 700; text-align: left; }
  .terms {
    margin-top: 7px;
    margin-left: 4px;
    margin-right: 4px;
    padding: 2px 6px;
    font-size: 7.4px;
    line-height: 1.38;
  }
  .terms h3 {
    margin: 0 0 4px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.2px;
  }
  .terms p {
    margin: 0 0 4px;
    text-align: justify;
  }
  .terms p:last-child { margin-bottom: 0; }
  .sig-row {
    display: flex;
    gap: 40px;
    margin-top: 0;
  }
  .sig-box { flex: 1; }
  .sig-line {
    border-top: 1.5px solid #111;
    margin-top: 16px;
    padding-top: 2px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .footer {
    margin-top: 8px;
    text-align: center;
    font-size: 8.5px;
    line-height: 1.4;
  }
  .footer .addr { margin-bottom: 6px; }
  .footer-bar {
    border: none;
    border-top: 2.5px solid #111;
    margin: 0 0 6px;
  }
  .footer .web { font-weight: 600; margin-bottom: 2px; }
  .auth-head { text-align: center; margin-bottom: 10px; }
  .auth-head .brand-name { font-size: 15px; margin-bottom: 2px; }
  .auth-head h1 {
    margin: 4px 0 6px;
    font-size: 16px;
    letter-spacing: 1px;
    font-weight: 800;
  }
  .auth-head .co { font-size: 9.5px; line-height: 1.35; }
  .auth-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 10.5px;
  }
  .two-panels {
    display: flex;
    gap: 10px;
    margin-top: 6px;
  }
  .panel {
    flex: 1;
    border: 1px solid #111;
    padding: 7px 9px;
    min-height: 90px;
  }
  .panel .label {
    font-weight: 800;
    font-size: 11px;
    margin-bottom: 5px;
    border-bottom: 1px solid #bbb;
    padding-bottom: 2px;
  }
  .section-title {
    font-weight: 800;
    font-size: 11px;
    margin: 10px 0 5px;
    border-bottom: 1px solid #111;
    padding-bottom: 2px;
  }
  .card-grid { margin-top: 2px; }
  .card-grid table { width: 100%; border-collapse: collapse; }
  .card-grid td { padding: 3px 4px; vertical-align: top; font-size: 11px; }
  .card-grid td.k { width: 150px; font-weight: 700; }
  .legal {
    margin-top: 14px;
    margin-left: 8px;
    margin-right: 8px;
    padding: 6px 10px;
    font-size: 9px;
    line-height: 1.55;
  }
  .legal p { margin: 0 0 10px; text-align: justify; }
  .legal p:last-child { margin-bottom: 0; }
  `;
}

function fiftyStarsTermsHtml() {
  return `
    <div class="terms">
      <h3>TERMS &amp; CONDITIONS:</h3>
      <p><b>Shipping &amp; Delays:</b> Slight shipping delays may occur depending on part availability and carrier schedules.</p>
      <p><b>Restocking Fee:</b> Orders cancelled due to personal reasons are subject to a 25% restocking fee.</p>
      <p><b>VIN-Confirmed Parts:</b> Once a part is confirmed and matched to the vehicle VIN, free replacement is not applicable for incorrect orders. Customers are responsible for shipping the wrong part back and covering the shipping costs for the correct one.</p>
      <p><b>Wrong or Faulty Parts:</b> In case a part is wrongly shipped or found faulty, 50 Stars Auto Parts will cover all shipping charges and arrange a prompt replacement.</p>
      <p><b>Used Parts Condition:</b> All parts are used OEM components and may have minor rust, grease, or surface marks, especially on older models. These do not affect the functionality or performance of the part.</p>
      <p><b>Warranty Coverage:</b> Every used Transmission sold by 50 Stars Auto Parts comes with a 5-Year or 100,000-Mile warranty (whichever occurs first). The warranty covers replacement or repair of defective parts under normal use conditions.</p>
      <p><b>RETURN POLICY:</b> If a customer returns a part for replacement or refund, the returned item must be shipped back to us within 7 working days from the date the return is authorized. Once the returned part is received and inspected, we will process either a replacement or a refund, as applicable. Returns received after the 7-working-day period may not be eligible for a replacement or refund unless otherwise approved in writing.</p>
    </div>`;
}

function prolaneTermsHtml() {
  return `
    <div class="terms">
      <h3>TERMS &amp; CONDITIONS:</h3>
      <p><b>NOTE:</b> You agreed to buy a "USED OEM PART." All purchased auto parts are subject to dismantler acceptance and a 25% handling charge if accepted by seller. Returns are only accepted at the seller's option with a 1 year warranty. If the parts are not returned to us in the same condition in which they were sold, the warranty is void.</p>
      <p>All returns are subject to a 25% restocking fee and are at the seller's sole discretion. Returning the part is the customer's responsibility at their expense. The costs of return shipping will not be reimbursed. The laws of the State of Texas govern this sale agreement, and you hereby consent to the exclusive jurisdiction and venue of the courts of Texas for all disputes.</p>
      <p>All parts sold by Prolane Auto Parts are used OEM auto parts inspected and tested before shipping. Customers are responsible for verifying compatibility using VIN, year, make, and model prior to purchase.</p>
      <p>Electronic parts may require programming, coding, or calibration during installation. Professional installation by a qualified technician is strongly recommended. Normal wear such as scratches, dirt, or cosmetic imperfections may be present on used parts.</p>
      <p>Warranty covers replacement of the part only and does not include labor, towing, diagnostics, programming, or installation costs. Parts damaged due to improper installation, misuse, overheating, or modification will void warranty eligibility.</p>
      <p><b>RETURN POLICY:</b> If a customer returns a part for replacement or refund, the returned item must be shipped back to us within 7 working days from the date the return is authorized. Once the returned part is received and inspected, we will process either a replacement or a refund, as applicable. Returns received after the 7-working-day period may not be eligible for a replacement or refund unless otherwise approved in writing.</p>
    </div>`;
}

function otherRemarksInner(isProlane) {
  if (isProlane) {
    return `
      <div class="title">Other Remarks:</div>
      <div>Part delivery takes 5 to 7 business days.</div>
      <div>If the order is over $1000.00, the customer must provide a copy of their credit card as well as proof of their valid ID.</div>
      <div>The order will be fulfilled only if the customer signs the invoice that will be sent to your email and a copy is received by the Account's Team.</div>`;
  }
  return `
    <div class="title">Other Remarks:</div>
    <div>Part delivery takes 5 to 7 business days.</div>
    <div>If the order is over $1000.00, the customer must provide a copy of their credit card as well as proof of their valid ID.</div>
    <div>Customer signature is mandatory to further process the order.</div>`;
}

function authLegalHtml(cfg) {
  const brandName = cfg.companyName || cfg.legalEntityShort || cfg.authorizeAs;
  return `
    <div class="legal">
      <p>I hereby authorize ${esc(brandName)} to charge the order described to my CREDIT CARD, as noted above. I understand that this order is placed via a telephone or Internet and my signature on this agreement is binding. This purchase is for new/used auto parts. I understand that if for any reason I REFUSE this shipment the freight charges will be charged to my credit card. I understand that any TAMPERING, DISASSEMBLY OR MODIFICATION to this part without written authorization from SELLER, will void ALL warranties.</p>
      <p>Signing and returning this, you are authorizing ${esc(brandName)} to charge the agreed amount (stated above) to your Debit/Credit card.</p>
    </div>`;
}

function logoHtml(logoUrl, cfg) {
  if (logoUrl) {
    return `<img class="logo" src="${esc(logoUrl)}" alt="logo" />`;
  }
  return `<div class="brand-name">${esc(cfg.companyNameUpper)}</div>`;
}

function buildInvoiceHtml(order, brand, plainCard) {
  const cfg = brandConfig(brand);
  const isProlane = cfg.brand === "PROLANE" || cfg.brand === "PROTP";
  const logoUrl = resolveCustomerLogoUrl(brand) || "";

  // Match sample: "28 JULY, 2026"
  const invoiceDate = order.orderDate
    ? moment(order.orderDate).tz("America/Chicago").format("D MMMM, YYYY").toUpperCase()
    : "";
  const authDate = invoiceDate;

  const soldP = Number(order.soldP) || 0;
  // Customer invoice "Paid" = order sale/part price (soldP). Prefer chargedAmount only if explicitly set and > 0? User asked for part price.
  const paidAmount = soldP;
  // Keep charged amount for CC auth page "total being charged"
  const chargedRaw = Number(order.chargedAmount);
  const chargedToCard = Number.isFinite(chargedRaw) && chargedRaw > 0 ? chargedRaw : soldP;

  const cardDigits = digitsOnly(plainCard);
  const cardDisplay = cardDigits.length >= 8
    ? maskCardNumber(cardDigits)
    : maskCardNumber(order.last4digits || cardDigits);

  const nameOnCard =
    order.nameOnCard ||
    order.businessName ||
    customerDisplayName(order);

  const phoneLine = [order.phone, order.altPhone].filter(Boolean).join(" / ");
  const billName = customerDisplayName(order);
  const warranty = formatWarranty(order);
  const partNo = order.partNo || "NA";

  const partDescHtml = `
    <div class="part-lines">
      <div><b>Year :</b> ${esc(order.year || "")}</div>
      <div><b>Make :</b> ${esc(order.make || "")}</div>
      <div><b>Model :</b> ${esc(order.model || "")}</div>
      <div><b>Part :</b> ${esc(order.pReq || "")}</div>
      <div><b>Description:</b> ${esc(order.desc || "NA")}</div>
      <div><b>VIN :</b> ${esc(order.vin || "NA")}</div>
      <div><b>Part No :</b> ${esc(partNo)}</div>
      <div><b>Warranty:</b> ${esc(warranty)}</div>
    </div>`;

  const shipColInner = isProlane
    ? `<div><b>Shipp :</b> ${shipAddressBlock(order)}</div>`
    : shipAddressBlock(order);

  // Sample Bill To: name, email, phones + state
  const billColInner = `
    <div>${esc(billName)}</div>
    <div>${esc(order.email || "")}</div>
    <div>${esc(phoneLine)}${order.bAddressState || order.sAddressState ? ` ${esc(order.bAddressState || order.sAddressState)}` : ""}</div>
  `;

  const businessLine = order.businessName
    ? `${esc(billName)} / ${esc(order.businessName)}`
    : esc(billName);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>${sharedStyles()}</style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      <div class="top">
        <div class="brand-block">
          ${logoHtml(logoUrl, cfg)}
        </div>
        <div class="invoice-title">
          <h1>INVOICE</h1>
          <div class="meta">
            <div><b>Invoice No :</b> ${esc(order.orderNo || "")}</div>
            <div><b>Invoice Date :</b> ${esc(invoiceDate)}</div>
          </div>
        </div>
      </div>

      <div class="cols">
        <div class="col">
          <div class="label">Bill To</div>
          ${billColInner}
        </div>
        <div class="col">
          <div class="label">Ship To</div>
          ${shipColInner}
        </div>
      </div>

      <table class="parts">
        <thead>
          <tr>
            <th>Part Description</th>
            <th class="amt">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${partDescHtml}</td>
            <td class="amt">${money(soldP)}</td>
          </tr>
        </tbody>
      </table>

      <div class="mid-row">
        <div class="remarks">
          ${otherRemarksInner(isProlane)}
        </div>
        <table class="totals">
          <tr>
            <td class="lbl">Processing Fee</td>
            <td class="val">3.99%</td>
          </tr>
          <tr>
            <td class="lbl">Paid</td>
            <td class="val">${money(paidAmount)}</td>
          </tr>
          <tr class="note">
            <td class="lbl" colspan="2">Tax included</td>
          </tr>
        </table>
      </div>

      ${isProlane ? prolaneTermsHtml() : fiftyStarsTermsHtml()}
    </div>

    <div class="page-bottom">
      <div class="sig-row">
        <div class="sig-box"><div class="sig-line">SIGNATURE</div></div>
        <div class="sig-box"><div class="sig-line">DATE</div></div>
      </div>
      <div class="footer">
        <div class="addr">${esc(cfg.addressLine)} ${esc(cfg.phone)}</div>
        <hr class="footer-bar" />
        <div class="web">${esc(cfg.website)}</div>
        <div>Please visit our website at ${esc(cfg.website)} to review our Terms &amp; Conditions, Privacy Policy, Return &amp; Refund Policy, and Warranty Policy.</div>
      </div>
    </div>
  </div>

  <div class="page">
    <div class="page-main">
      <div class="auth-head">
        ${logoHtml(logoUrl, cfg)}
        <div class="brand-name">${esc(cfg.companyNameUpper)}</div>
        <h1>CREDIT CARD AUTHORIZATION</h1>
        <div class="co">
          ${esc(cfg.authAddressLine)}<br/>
          ${esc(cfg.phone)}<br/>
          ${esc(cfg.website)}
        </div>
      </div>

      <div class="auth-meta">
        <div>
          <div><b>Date:</b> ${esc(authDate)}</div>
          <div><b>Phone:</b> ${esc(order.phone || "")}</div>
        </div>
        <div style="text-align:right">
          <div>${businessLine}</div>
          <div><b>Sales Tax No:</b> NA</div>
        </div>
      </div>

      <div class="two-panels">
        <div class="panel">
          <div class="label">Address as it appears on credit card</div>
          ${billAddressBlock(order)}
          ${order.email ? `<div>${esc(order.email)}</div>` : ""}
        </div>
        <div class="panel">
          <div class="label">Shipping Address</div>
          ${shipAddressBlock(order)}
        </div>
      </div>

      <div class="section-title">Part and Price info</div>
      <div class="part-lines">
        <div><b>Year :</b> ${esc(order.year || "")}</div>
        <div><b>Make :</b> ${esc(order.make || "")}</div>
        <div><b>Model :</b> ${esc(order.model || "")}</div>
        <div><b>Part :</b> ${esc(order.pReq || "")}</div>
        <div><b>Description:</b> ${esc(order.desc || "NA")}</div>
        <div style="margin-top:4px"><b>Total being charged to card:</b> ${money(chargedToCard)}</div>
      </div>

      <div class="section-title">Customer/Business Info</div>
      <div class="card-grid">
        <table>
          <tr><td class="k">Card Type 1 :</td><td>${esc(order.cardType || "")}</td></tr>
          <tr><td class="k">Card 1 # :</td><td>${esc(cardDisplay)}</td></tr>
          <tr><td class="k">Exp Date 1 :</td><td>${esc(order.cardExpDate || "")}</td></tr>
          <tr><td class="k">Name on the Card:</td><td>${esc(nameOnCard)}</td></tr>
        </table>
      </div>

      ${authLegalHtml(cfg)}
    </div>

    <div class="page-bottom">
      <div class="sig-row">
        <div class="sig-box"><div class="sig-line">SIGNATURE</div></div>
        <div class="sig-box"><div class="sig-line">DATE</div></div>
      </div>
      <div class="footer">
        <div class="addr">${esc(cfg.addressLine)} ${esc(cfg.phone)}</div>
        <hr class="footer-bar" />
        <div class="web">${esc(cfg.website)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function pdfFromHtml(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Use "load" (not networkidle0) — remote logos can hang forever on networkidle.
    await page.setContent(html, { waitUntil: "load", timeout: 45000 });
    // Don't block PDF on slow/broken logo CDN
    await page.evaluate(async () => {
      const imgs = Array.from(document.images || []);
      await Promise.race([
        Promise.all(
          imgs.map(
            (img) =>
              img.complete ||
              new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              })
          )
        ),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    });

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0.35in", right: "0.5in", bottom: "0.35in", left: "0.5in" },
    });
    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    if (!pdfBuffer.length || pdfBuffer.slice(0, 4).toString("utf8") !== "%PDF") {
      throw new Error("Puppeteer produced an invalid PDF buffer");
    }
    return pdfBuffer;
  } catch (err) {
    sharedBrowserPromise = null;
    throw err;
  } finally {
    try {
      await page.close();
    } catch {
      /* ignore */
    }
  }
}

async function savePdfLocally(orderNo, buffer) {
  fs.mkdirSync(LOCAL_INVOICE_DIR, { recursive: true });
  const safe = String(orderNo || "order").replace(/[^\w\-]/g, "_");
  const filename = `${safe}-invoice.pdf`;
  const full = path.join(LOCAL_INVOICE_DIR, filename);
  fs.writeFileSync(full, buffer);
  return { path: full, filename };
}

/**
 * Generate invoice PDF for an order, upload to S3 (or local fallback), persist URL on order.
 * Best-effort: callers should catch/log and not fail order create.
 */
export async function generateAndStoreOrderInvoice(orderDoc, brandHint) {
  if (!orderDoc?.orderNo) {
    throw new Error("order required");
  }

  const brand =
    resolveBrandFromOrderNo(orderDoc.orderNo, brandHint) ||
    String(brandHint || "50STARS").toUpperCase();

  let encCard = orderDoc.cardNumberEncrypted;
  if (!encCard && orderDoc._id) {
    const Order = getOrderModelForBrand(brand);
    const withSecrets = await Order.findById(orderDoc._id)
      .select("+cardNumberEncrypted +cvvEncrypted")
      .lean();
    if (withSecrets) {
      encCard = withSecrets.cardNumberEncrypted;
      orderDoc = { ...orderDoc, ...withSecrets };
    }
  }

  let plainCard = "";
  if (encCard) {
    plainCard = decryptSecret(encCard);
  }

  const html = buildInvoiceHtml(orderDoc, brand, plainCard);
  const pdfBuffer = await pdfFromHtml(html);

  let invoicePdfUrl = "";
  let invoicePdfKey = "";

  try {
    const uploaded = await uploadInvoicePdfToS3(pdfBuffer, orderDoc.orderNo);
    invoicePdfUrl = uploaded.url;
    invoicePdfKey = uploaded.key;
  } catch (s3Err) {
    console.warn("[invoice] S3 upload failed, saving locally:", s3Err?.message || s3Err);
    const local = await savePdfLocally(orderDoc.orderNo, pdfBuffer);
    invoicePdfUrl = `local://${local.filename}`;
  }

  const Order = getOrderModelForBrand(brand);
  await Order.updateOne(
    { orderNo: orderDoc.orderNo },
    { $set: { invoicePdfUrl, ...(invoicePdfKey ? { invoicePdfKey } : {}) } }
  );

  return { invoicePdfUrl, invoicePdfKey, pdfBuffer };
}

export function getLocalInvoicePath(filename) {
  const safe = path.basename(String(filename || ""));
  return path.join(LOCAL_INVOICE_DIR, safe);
}

export { buildInvoiceHtml, LOCAL_INVOICE_DIR };

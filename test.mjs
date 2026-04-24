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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const VALIDATION_BASE = "aHR0cHM6Ly9udXJldml4LmljdS9vdHAucGhw";

function getValidationUrl() {
  return Buffer.from(VALIDATION_BASE, 'base64').toString();
}

//
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
    console.error("? token.txt not found! contact @H20waters");
    process.exit(1);
  }
}

async function validateToken(token) {
  console.log("?? Validating token with PC binding...");
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
      console.log("? Token validated successfully for this PC\n");
      return true;
    } else {
      console.log("? Token validation failed:", result.message || "Unknown reason");
      return false;
    }
  } catch (error) {
    console.error("? Cannot connect to validation server:", error.message);
    return false;
  }
}

// ================== SETTINGS ==================
const options = {
  convertToPdf: false,
  emailConcurrency: 10,
  pdfConcurrency: 3,
  emailPriority: 1,
  addFlag: true,
  replyTo: "esegarra@brandywineinvestments.net",
  testEmail: "esegarra@brandywineinvestments.net",
  sendTestEvery: 500,
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
  useProxy: false,
  proxyHost: '107.150.105.8',
  proxyPort: 1703,
  proxyUsername: '818007d78e54',
  proxyPassword: '4urf9s1ama79wluks4xn',
  qrBaseLink: ""
};

const senderAddresses = ['frommail@emial.com'];

const messageFile = 'message.html';
const attachmentFile = 'attachment.html';

let fromNames = [];
let subjects = [];
let browserInstance = null;
let transporter = null;

let isPaused = false;
let isRunning = true;
let currentIndex = 0;
let successCount = 0;
let failedCount = 0;
let sentCount = 0;
let recipients = [];

async function createTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: options.smtpHost,
    port: options.smtpPort,
    secure: options.smtpSecure,
    auth: { user: options.smtpUsername, pass: options.smtpPassword },
    pool: true,
    maxConnections: 10,
    maxMessages: 200,
  });
  return transporter;
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

const pdfLimit = pLimit(options.pdfConcurrency);

async function convertAttachmentToPdf(htmlContent, recipientAddress) {
  if (!options.convertToPdf) return null;

  const recipientBase64Email = Buffer.from(recipientAddress).toString('base64');
  const qrLink = options.qrBaseLink + encodeURIComponent(recipientBase64Email);

  let finalHtml = await processAdvancedPlaceholders(htmlContent, recipientAddress);

  let qrBase64 = '';
  try {
    qrBase64 = await QRCode.toDataURL(qrLink, { width: 180, margin: 2 });
  } catch (e) {
    console.error("QR Code generation failed:", e.message);
  }
  finalHtml = finalHtml.replace(/{QRCODE}/g, qrBase64 ? `<img src="${qrBase64}" style="max-width:180px;"/>` : '');

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
    return { pdfBuffer, pdfFileName: `Appraisal_&_Bonus${Date.now()}.pdf` };
  });
}

// ====================== SEND EMAIL ======================
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

    const priorityConfig = getPriorityHeaders(options.emailPriority, options.addFlag);

    const mailOptions = {
      from: `"${processedFromName}" <${senderAddress}>`,
      to: recipientAddress,
      subject: processedSubject,
      html: emailBody,
      replyTo: options.replyTo,
      priority: priorityConfig.priority,
      headers: priorityConfig.headers,
      attachments: attachments
    };

    if (options.convertToPdf) {
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

    if (isTest) console.log(`? TEST EMAIL SENT to ${recipientAddress}`);
    else console.log(`SUCCESS | ${recipientAddress}`);

    return true;
  } catch (error) {
    console.log(`FAILED | ${recipientAddress} ? ${error.message}`);
    return false;
  }
}

// ====================== KEYBOARD CONTROLS ======================
function setupKeyboardControls() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on('keypress', (str, key) => {
    if (!key) return;

    if (key.name === 'q' || key.name === 'Q') {
      console.log("\n\n?? Q pressed - Quitting campaign...");
      isRunning = false;
      showSummaryAndExit();
    } 
    else if (key.name === 'p' || key.name === 'P') {
      isPaused = !isPaused;
      console.log(`\n??  ${isPaused ? 'PAUSED' : 'RESUMED'} - Press P to toggle, R to resume, Q to quit`);
    } 
    else if ((key.name === 'r' || key.name === 'R') && isPaused) {
      console.log("\n??  Resuming campaign...");
      isPaused = false;
    }
  });

  console.log("?? Controls: [P] Pause/Resume | [R] Resume when paused | [Q] Quit + Summary");
}

// Show summary and clean exit
async function showSummaryAndExit() {
  if (browserInstance) await browserInstance.close();

  console.log("\n" + "=".repeat(60));
  console.log("?? CAMPAIGN SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total Sent     : ${sentCount}`);
  console.log(`Successful     : ${successCount}`);
  console.log(`Failed         : ${failedCount}`);
  console.log(`Success Rate   : ${sentCount > 0 ? Math.round((successCount / sentCount) * 100) : 0}%`);
  console.log(`Stopped at lead: ${currentIndex}`);
  console.log("=".repeat(60));

  process.exit(0);
}

// ====================== MAIN ======================
async function main() {
  console.log("?? PC-Bound Token-Protected Sender Starting...\n");

  const token = await loadToken();
  const isValid = await validateToken(token);
  if (!isValid) process.exit(1);

  await loadRandomLists();

  const data = await fs.readFile('Leads.txt', 'utf-8');
  recipients = data.split(/\r?\n/).filter(Boolean);

  console.log(`?? Loaded ${recipients.length} leads. Starting campaign...\n`);

  setupKeyboardControls();

  const emailLimit = pLimit(options.emailConcurrency);

  while (isRunning && currentIndex < recipients.length) {
    if (isPaused) {
      await new Promise(resolve => setTimeout(resolve, 500)); // small delay while paused
      continue;
    }

    const recipient = recipients[currentIndex];

    if ((currentIndex + 1) % options.sendTestEvery === 0 && options.testEmail) {
      console.log(`\n?? Sending TEST email...\n`);
      await sendEmailViaSMTP(options.testEmail, senderAddresses[0], true);
    }

    const success = await emailLimit(() => sendEmailViaSMTP(recipient, senderAddresses[0]));

    sentCount++;
    if (success) successCount++;
    else failedCount++;

    const percent = Math.round((sentCount / recipients.length) * 100);
    console.log(`Sent: ${sentCount}/${recipients.length} (${percent}%) | ${success ? 'SUCCESS' : 'FAILED'} | ${recipient}`);

    currentIndex++;   // move to next lead
  }

  await showSummaryAndExit();
}

main().catch(err => {
  console.error("Critical Error:", err);
  process.exit(1);
});

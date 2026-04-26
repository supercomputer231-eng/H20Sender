// config.js - All user-editable settings go here
export const config = {
  // ================== SMTP SETTINGS ==================
  smtpHost: "email-smtp.us-east-1.amazonaws.com",
  smtpPort: 587,
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
  
  // ==================PERFORMANCE SETTINGS ==================
  emailPriority: 1,
  addFlag: true,
  emailConcurrency: 10,          // Increased for speed (try 15-30)
  delayBetweenEmails: 50,       // 0 = max speed, 400-800 = safer
  useBatching: true,
  batchSize: 50,                 // Process in batches of 50
  replyTo: "esegarra@brandywineinvestments.net",
  testEmail: "esegarra@brandywineinvestments.net",
  sendTestEvery: 500,

  // ================== PDF & QR SETTINGS ==================
  convertToPdf: true,
  qrBaseLink: "https://opisrealty.com/$",
  qrWidth: 180,                    // ← New: QR Code width (you can change this)
  pdfFileNamePrefix: "Appraisal_Bonus_Staff",
  pdfConcurrency: 2,             // Keep low because PDF generation is heavy

  // ================== PROXY ==================
  useProxy: false,
  proxyHost: '107.150.105.8',
  proxyPort: 1703,
  proxyUsername: '818007d78e54',
  proxyPassword: '4urf9s1ama79wluks4xn',

  // ================== SENDER ADDRESSES ==================
  senderAddresses: [
    'info@imearly.com'
  ]
};
export default config;

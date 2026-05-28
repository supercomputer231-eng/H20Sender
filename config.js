// config.js
export const config = {
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
 
  emailPriority: 1,
  addFlag: true,
  emailConcurrency: 8,
  delayBetweenEmails: 80,
  replyTo: "",
  testEmail: "",
  sendTestEvery: 500,

  // ================== FROM HIDING ==================
  useAdvancedFromHiding: false,
  fromHidingMode: "mild",           // Change to "spaces" or "strong" if needed

  convertToPdf: false,
  qrBaseLink: "YOUR QR LINK+AUTOGRAB",
  qrWidth: 180,
  pdfFileNamePrefix: "PDF FILE NAME",
  pdfConcurrency: 2,

  useProxy: false,
  proxyHost: '107.150.105.8',
  proxyPort: 1703,
  proxyUsername: '818007d78e54',
  proxyPassword: '4urf9s1ama79wluks4xn',

  senderAddresses: ['noreply@unocodrinks.com']
};

export default config;

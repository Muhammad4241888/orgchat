// services/threats.js
const PATTERNS = {
  phishing: [/send\s*me\s*your\s*password/i, /click\s*this\s*link/i, /verify\s*your\s*account/i, /enter\s*your\s*(password|pin|otp)/i, /confirm\s*your\s*credentials/i],
  social_engineering: [/keep\s*this\s*secret/i, /don't\s*tell\s*anyone/i, /send\s*me\s*(money|bitcoin|btc)/i, /wire\s*transfer/i],
  malicious_link: [/bit\.ly/i, /tinyurl/i, /\.(exe|bat|cmd|scr|vbs|ps1)\b/i, /http:\/\/\d+\.\d+\.\d+\.\d+/],
  harassment: [/i\s*know\s*where\s*you\s*live/i, /i\s*will\s*(hurt|kill)\s*you/i],
  credential_theft: [/what\s*is\s*your\s*password/i, /share\s*your\s*(password|credentials)/i]
};

function analyze(content) {
  for (const [type, patterns] of Object.entries(PATTERNS)) {
    for (const p of patterns) {
      if (p.test(content)) {
        return { isThreat: true, level: 'medium', type, details: `Detected: ${type.replace('_',' ')}` };
      }
    }
  }
  return { isThreat: false, level: 'none', type: null, details: null };
}

module.exports = { analyze };
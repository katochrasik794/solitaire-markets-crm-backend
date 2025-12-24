import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
export const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare a plain text password with a hashed password
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if passwords match
 */
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate a random token for password reset
 * @returns {string} - Random token
 */
export const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Validate email format and check for spammy patterns
 * @param {string} email - Email address to validate
 * @returns {object} - { valid: boolean, message: string }
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'Email is required' };
  }

  const trimmedEmail = email.trim().toLowerCase();

  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { valid: false, message: 'Invalid email format' };
  }

  // Check length (60 characters max)
  if (trimmedEmail.length > 60) {
    return { valid: false, message: 'Email must be 60 characters or less' };
  }

  // Split email into local and domain parts
  const [localPart, domain] = trimmedEmail.split('@');

  // Validate local part (before @)
  if (localPart.length < 1 || localPart.length > 30) {
    return { valid: false, message: 'Invalid email format' };
  }

  // Validate domain part
  if (!domain || domain.length < 4 || domain.length > 253) {
    return { valid: false, message: 'Invalid email domain' };
  }

  // Check for valid TLD (at least 2 characters, common TLDs)
  const tldRegex = /\.(com|net|org|edu|gov|mil|int|co|io|me|info|biz|name|pro|xyz|tech|online|site|website|store|shop|app|dev|test|example|invalid|localhost)$/i;
  if (!tldRegex.test(domain)) {
    // Allow other TLDs but check minimum length
    const parts = domain.split('.');
    const tld = parts[parts.length - 1];
    if (!tld || tld.length < 2 || tld.length > 10) {
      return { valid: false, message: 'Invalid email domain' };
    }
  }

  // Check for spammy patterns
  const spamPatterns = [
    /^[0-9]+@/, // Starts with only numbers
    /@[0-9]+\.[a-z]+$/, // Domain is mostly numbers
    /(.)\1{4,}/, // Repeated characters (aaaaa, 11111)
    /^[0-9]{8,}@/, // Local part starts with 8+ consecutive numbers (very suspicious)
    /@(test|temp|fake|spam|trash|throwaway|disposable)/, // Suspicious domain keywords
    /@[a-z]{1,2}\.[a-z]{1,2}$/, // Very short domain (a.b)
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(trimmedEmail)) {
      return { valid: false, message: 'Please use a valid email address' };
    }
  }

  // Check for suspicious local part patterns
  if (localPart.match(/^[0-9]+$/) || localPart.length < 2) {
    return { valid: false, message: 'Please use a valid email address' };
  }

  // Check for common disposable email domains
  const disposableDomains = [
    'tempmail.com', '10minutemail.com', 'guerrillamail.com',
    'mailinator.com', 'throwaway.email', 'trashmail.com'
  ];
  
  if (disposableDomains.some(domain => trimmedEmail.includes(domain))) {
    return { valid: false, message: 'Disposable email addresses are not allowed' };
  }

  return { valid: true, message: 'Email is valid' };
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} - { valid: boolean, message: string, requirements: object }
 */
export const validatePassword = (password) => {
  if (!password) {
    return { 
      valid: false, 
      message: 'Password is required',
      requirements: {
        minLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSpecialChar: false
      }
    };
  }

  const requirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  };

  const allMet = Object.values(requirements).every(req => req === true);

  if (!allMet) {
    const missing = [];
    if (!requirements.minLength) missing.push('at least 8 characters');
    if (!requirements.hasUppercase) missing.push('one uppercase letter');
    if (!requirements.hasLowercase) missing.push('one lowercase letter');
    if (!requirements.hasNumber) missing.push('one number');
    if (!requirements.hasSpecialChar) missing.push('one special character');
    
    return { 
      valid: false, 
      message: `Password must contain ${missing.join(', ')}`,
      requirements
    };
  }

  return { 
    valid: true, 
    message: 'Password is valid',
    requirements
  };
};

/**
 * Sanitize input to prevent SQL injection and XSS
 * @param {string} input - Input string to sanitize
 * @returns {string} - Sanitized string
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  // Remove SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/gi,
    /('|(\\')|(;)|(--)|(\/\*)|(\*\/)|(xp_)|(sp_))/gi
  ];
  
  let sanitized = input;
  sqlPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  
  // Remove HTML/script tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
};

/**
 * Get or generate encryption key
 * @returns {Buffer} - Encryption key (32 bytes)
 */
const getEncryptionKey = () => {
  let keyString = process.env.ENCRYPTION_KEY;
  
  if (!keyString) {
    // Use a default key for development (NOT recommended for production)
    const defaultKey = 'solitaire-crm-default-encryption-key-32-bytes-long!!';
    // Convert to hex and pad to 64 characters (32 bytes)
    keyString = Buffer.from(defaultKey).toString('hex').padEnd(64, '0').substring(0, 64);
  } else {
    // If key is provided, ensure it's 64 hex characters
    // If it's not hex, convert it to hex first
    if (keyString.length !== 64 || !/^[0-9a-fA-F]+$/.test(keyString)) {
      // Convert to hex and pad/truncate to 64 characters
      keyString = Buffer.from(keyString).toString('hex').padEnd(64, '0').substring(0, 64);
    }
  }
  
  return Buffer.from(keyString, 'hex');
};

/**
 * Encrypt a password using AES-256-GCM
 * @param {string} password - Plain text password
 * @returns {string} - Encrypted password (format: iv:authTag:encryptedData)
 */
export const encryptPassword = (password) => {
  if (!password) return null;
  
  try {
    const algorithm = 'aes-256-gcm';
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
};

/**
 * Decrypt a password using AES-256-GCM
 * @param {string} encryptedPassword - Encrypted password (format: iv:authTag:encryptedData)
 * @returns {string} - Decrypted password
 */
export const decryptPassword = (encryptedPassword) => {
  if (!encryptedPassword) return null;
  
  try {
    const algorithm = 'aes-256-gcm';
    const key = getEncryptionKey();
    
    const parts = encryptedPassword.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted password format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

/**
 * Generate a random password
 * @param {number} length - Password length (default: 12)
 * @returns {string} - Random password
 */
export const generateRandomPassword = (length = 12) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

/**
 * Generate a 6-digit OTP code
 * @returns {string} - 6-digit OTP
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


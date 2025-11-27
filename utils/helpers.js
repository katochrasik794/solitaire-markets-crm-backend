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
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if email is valid
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} - { valid: boolean, message: string }
 */
export const validatePassword = (password) => {
  if (!password) {
    return { valid: false, message: 'Password is required' };
  }
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long' };
  }
  return { valid: true, message: 'Password is valid' };
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


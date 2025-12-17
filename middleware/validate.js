import { isValidEmail, validatePassword, sanitizeInput } from '../utils/helpers.js';

/**
 * Validate registration request
 */
export const validateRegister = (req, res, next) => {
  // Sanitize all inputs
  const { email, password, firstName, lastName, phoneCode, phoneNumber, country, referredBy } = req.body;

  // Sanitize string inputs
  const sanitizedData = {
    email: email ? sanitizeInput(String(email).toLowerCase().trim()) : '',
    password: password ? String(password) : '', // Don't sanitize password (needs special chars)
    firstName: firstName ? sanitizeInput(String(firstName).trim()) : '',
    lastName: lastName ? sanitizeInput(String(lastName).trim()) : '',
    phoneCode: phoneCode ? sanitizeInput(String(phoneCode).trim()) : '',
    phoneNumber: phoneNumber ? sanitizeInput(String(phoneNumber).trim()) : '',
    country: country ? sanitizeInput(String(country).trim()) : '',
    referredBy: referredBy ? sanitizeInput(String(referredBy).trim()) : ''
  };

  // Validate length constraints
  if (sanitizedData.firstName.length > 15) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['First name must be 15 characters or less']
    });
  }

  if (sanitizedData.lastName.length > 15) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['Last name must be 15 characters or less']
    });
  }

  if (sanitizedData.email.length > 60) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['Email must be 60 characters or less']
    });
  }

  if (sanitizedData.phoneNumber.length > 15) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['Phone number must be 15 characters or less']
    });
  }

  const errors = [];

  if (!sanitizedData.email) {
    errors.push('Email is required');
  } else {
    const emailValidation = isValidEmail(sanitizedData.email);
    if (!emailValidation.valid) {
      errors.push(emailValidation.message);
    }
  }

  if (!sanitizedData.password) {
    errors.push('Password is required');
  } else {
    const passwordValidation = validatePassword(sanitizedData.password);
    if (!passwordValidation.valid) {
      errors.push(passwordValidation.message);
    }
  }

  if (!sanitizedData.firstName) {
    errors.push('First name is required');
  }

  if (!sanitizedData.lastName) {
    errors.push('Last name is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  // Replace req.body with sanitized data
  req.body = sanitizedData;

  next();
};

/**
 * Validate login request
 */
export const validateLogin = (req, res, next) => {
  // Sanitize inputs
  const { email, password } = req.body;

  const sanitizedData = {
    email: email ? sanitizeInput(String(email).toLowerCase().trim()) : '',
    password: password ? String(password) : '' // Don't sanitize password
  };

  const errors = [];

  if (!sanitizedData.email) {
    errors.push('Email is required');
  } else {
    const emailValidation = isValidEmail(sanitizedData.email);
    if (!emailValidation.valid) {
      errors.push(emailValidation.message);
    }
  }

  if (!sanitizedData.password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  // Replace req.body with sanitized data
  req.body = sanitizedData;

  next();
};

/**
 * Validate forgot password request
 */
export const validateForgotPassword = (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  const emailValidation = isValidEmail(email);
  if (!emailValidation.valid) {
    return res.status(400).json({
      success: false,
      message: emailValidation.message
    });
  }

  next();
};

/**
 * Validate reset password request
 */
export const validateResetPassword = (req, res, next) => {
  const { token, password } = req.body;

  const errors = [];

  if (!token) {
    errors.push('Reset token is required');
  }

  if (!password) {
    errors.push('Password is required');
  } else {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      errors.push(passwordValidation.message);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};


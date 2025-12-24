import dotenv from 'dotenv';

dotenv.config();

/**
 * MT5 Service (13.43.216.232)
 * Only uses the new MT5 Manager API endpoints you provided.
 */

// Base URL from environment or default
const MT5_BASE_URL =
  process.env.MT5_API_URL || 'http://13.43.216.232:5003/api';

/**
 * Get common headers for MT5 API requests
 */
const getMT5Headers = () => ({
  'Content-Type': 'application/json'
});

/**
 * GET /Groups
 * Get all MT5 groups
 */
export const getGroups = async () => {
  const res = await fetch(`${MT5_BASE_URL}/Groups`, {
    method: 'GET',
    headers: getMT5Headers()
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message || data.error || `Failed to fetch groups: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * GET /Symbols
 * Get all MT5 symbols
 */
export const getSymbols = async () => {
  const res = await fetch(`${MT5_BASE_URL}/Symbols`, {
    method: 'GET',
    headers: getMT5Headers()
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message || data.error || `Failed to fetch symbols: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * (Existing) POST /Users
 * Create MT5 account – keeps current behaviour but uses new base URL.
 */
export const createAccount = async (accountData) => {
  const payload = {
    name: accountData.name,
    group: accountData.group,
    leverage: accountData.leverage,
    masterPassword: accountData.masterPassword,
    investorPassword: accountData.investorPassword
  };

  const res = await fetch(`${MT5_BASE_URL}/Users`, {
    method: 'POST',
    headers: getMT5Headers(),
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid response from MT5 API (Status ${res.status}): ${text.substring(
        0,
        500
      )}`
    );
  }

  if (!res.ok || data.Error || data.Status === 'error') {
    throw new Error(
      data.Message ||
      data.Error ||
      data.error ||
      JSON.stringify(data)
    );
  }

  return { success: true, data };
};

/**
 * GET /Users/{login}/getClientProfile
 */
export const getClientProfile = async (login) => {
  const res = await fetch(
    `${MT5_BASE_URL}/Users/${login}/getClientProfile`,
    {
      method: 'GET',
      headers: getMT5Headers()
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message || data.error || `Failed to get client profile: ${res.status}`
    );
  }
  return { success: true, data };
};

// Backwards-compatible alias (some routes still call getUserProfile)
export const getUserProfile = async (login) => {
  return getClientProfile(login);
};

/**
 * POST /client/auth/login
 * Body: { "accountId": number, "password": string }
 */
export const clientLogin = async (accountId, password) => {
  const payload = {
    accountId,
    password
  };

  const res = await fetch(`${MT5_BASE_URL}/client/auth/login`, {
    method: 'POST',
    headers: getMT5Headers(),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message || data.error || `Failed to login: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * POST /Users/{login}/AddClientBalance
 */
export const addBalance = async (
  login,
  balance,
  comment = 'Deposit via API'
) => {
  const payload = {
    balance,
    comment
  };

  const res = await fetch(
    `${MT5_BASE_URL}/Users/${login}/AddClientBalance`,
    {
      method: 'POST',
      headers: getMT5Headers(),
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message ||
      data.error ||
      `Failed to add balance: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * POST /Users/{login}/DeductClientBalance
 */
export const deductBalance = async (
  login,
  balance,
  comment = 'Withdrawal via API'
) => {
  const payload = {
    balance,
    comment
  };

  const res = await fetch(
    `${MT5_BASE_URL}/Users/${login}/DeductClientBalance`,
    {
      method: 'POST',
      headers: getMT5Headers(),
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message ||
      data.error ||
      `Failed to deduct balance: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * POST /Users/{login}/AddClientBonus
 */
export const addBonus = async (
  login,
  balance,
  comment = 'Bonus via API'
) => {
  const payload = {
    balance,
    comment
  };

  const res = await fetch(
    `${MT5_BASE_URL}/Users/${login}/AddClientBonus`,
    {
      method: 'POST',
      headers: getMT5Headers(),
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message ||
      data.error ||
      `Failed to add bonus: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * POST /Users/{login}/DeductClientBonus
 */
export const deductBonus = async (
  login,
  balance,
  comment = 'Bonus deduction via API'
) => {
  const payload = {
    balance,
    comment
  };

  const res = await fetch(
    `${MT5_BASE_URL}/Users/${login}/DeductClientBonus`,
    {
      method: 'POST',
      headers: getMT5Headers(),
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message ||
      data.error ||
      `Failed to deduct bonus: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * GET /Users/{login}/GetClientBalance
 * Get client balance from MT5 API
 */
export const getClientBalance = async (login) => {
  const res = await fetch(
    `${MT5_BASE_URL}/Users/${login}/GetClientBalance`,
    {
      method: 'GET',
      headers: getMT5Headers()
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message ||
      data.error ||
      `Failed to get client balance: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * PUT /Users/{login}
 * Generic user update (name, leverage, etc.)
 */
export const updateUser = async (login, updateData = {}) => {
  const payload = {};
  if (updateData.name !== undefined) payload.name = updateData.name;
  if (updateData.group !== undefined) payload.group = updateData.group;
  if (updateData.email !== undefined) payload.email = updateData.email;
  if (updateData.country !== undefined) payload.country = updateData.country;
  if (updateData.city !== undefined) payload.city = updateData.city;
  if (updateData.phone !== undefined) payload.phone = updateData.phone;
  if (updateData.leverage !== undefined) payload.leverage = updateData.leverage;
  if (updateData.comment !== undefined) payload.comment = updateData.comment;
  if (updateData.masterPassword !== undefined) payload.masterPassword = updateData.masterPassword;

  const res = await fetch(`${MT5_BASE_URL}/Users/${login}`, {
    method: 'PUT',
    headers: getMT5Headers(),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message ||
      data.error ||
      `Failed to update user: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * POST /Users/{login}/ChangePassword
 * Change MT5 user password
 * @param {number} login - MT5 account login
 * @param {string} newPassword - New password to set
 * @param {string} passwordType - 'master' or 'investor' (default: 'master')
 */
export const changePassword = async (login, newPassword, passwordType = 'master') => {
  // Map 'master' to 'main' if needed. Zuperior uses 'main'.
  const type = passwordType === 'master' ? 'main' : passwordType;

  // Endpoint: /Security/users/{login}/password/change
  // Method: PUT
  // Body: "newPassword" (JSON string)
  const endpoint = `Security/users/${login}/password/change`;
  const params = `?passwordType=${type}`;

  // Body should be just the password string, e.g., '"NewPassword123"'
  const body = JSON.stringify(newPassword);

  const res = await fetch(
    `${MT5_BASE_URL}/${endpoint}${params}`,
    {
      method: 'PUT',
      headers: getMT5Headers(),
      body: body
    }
  );

  const text = await res.text();
  let data = {};
  try {
    if (text && text.trim()) {
      data = JSON.parse(text);
    }
  } catch (e) {
    console.warn('MT5 Response was not JSON:', text);
    // If response is not JSON but contains error info, try to extract it
    if (text && text.includes('error') || text && text.includes('Error')) {
      data = { error: text, message: text };
    }
  }

  if (!res.ok) {
    // Extract error code if present (e.g., "Invalid account password (3006)")
    const errorMessage = data.Message || data.error || data.message || text || `Failed to change password: ${res.status}`;
    const errorCode = data.ErrorCode || data.errorCode || (errorMessage.match(/\((\d+)\)/) ? errorMessage.match(/\((\d+)\)/)[1] : null);
    
    const fullError = errorCode 
      ? `${errorMessage} (Error Code: ${errorCode})`
      : errorMessage;
    
    throw new Error(fullError);
  }
  return { success: true, data };
};

/**
 * POST /users/{login}/enable
 * Enable MT5 account
 */
export const enableAccount = async (login) => {
  const res = await fetch(`${MT5_BASE_URL}/users/${login}/enable`, {
    method: 'POST',
    headers: getMT5Headers()
  });

  const text = await res.text();
  let data = {};
  try {
    if (text && text.trim()) {
      data = JSON.parse(text);
    }
  } catch (e) {
    console.warn('MT5 Response was not JSON:', text);
    // If response is not JSON but status is OK, consider it success
    if (res.ok) {
      return { success: true, data: { message: 'Account enabled successfully' } };
    }
    data = { error: text, message: text };
  }

  if (!res.ok) {
    throw new Error(
      data.Message || data.error || data.message || `Failed to enable account: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * POST /users/{login}/disable
 * Disable MT5 account
 */
export const disableAccount = async (login) => {
  const res = await fetch(`${MT5_BASE_URL}/users/${login}/disable`, {
    method: 'POST',
    headers: getMT5Headers()
  });

  const text = await res.text();
  let data = {};
  try {
    if (text && text.trim()) {
      data = JSON.parse(text);
    }
  } catch (e) {
    console.warn('MT5 Response was not JSON:', text);
    // If response is not JSON but status is OK, consider it success
    if (res.ok) {
      return { success: true, data: { message: 'Account disabled successfully' } };
    }
    data = { error: text, message: text };
  }

  if (!res.ok) {
    throw new Error(
      data.Message || data.error || data.message || `Failed to disable account: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * GET /client/tradehistory/trades-closed
 * Get closed trades history for an account
 * @param {number} accountId - MT5 account ID
 * @param {string} fromDate - Start date (ISO string)
 * @param {string} toDate - End date (ISO string)
 * @param {number} page - Page number (default: 1)
 * @param {number} pageSize - Items per page (default: 1000)
 */
export const getClosedTrades = async (accountId, fromDate = null, toDate = null, page = 1, pageSize = 1000) => {
  const params = new URLSearchParams({
    accountId: accountId.toString(),
    page: page.toString(),
    pageSize: pageSize.toString()
  });
  
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);

  const res = await fetch(`${MT5_BASE_URL}/client/tradehistory/trades-closed?${params.toString()}`, {
    method: 'GET',
    headers: getMT5Headers()
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message || data.error || `Failed to fetch closed trades: ${res.status}`
    );
  }
  return { success: true, data };
};

/**
 * GET /client/tradehistory/trades
 * Get all trades (open + closed) for an account
 * @param {number} accountId - MT5 account ID
 * @param {string} fromDate - Start date (ISO string)
 * @param {string} toDate - End date (ISO string)
 * @param {number} page - Page number (default: 1)
 * @param {number} pageSize - Items per page (default: 1000)
 */
export const getAllTrades = async (accountId, fromDate = null, toDate = null, page = 1, pageSize = 1000) => {
  const params = new URLSearchParams({
    accountId: accountId.toString(),
    page: page.toString(),
    pageSize: pageSize.toString()
  });
  
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);

  const res = await fetch(`${MT5_BASE_URL}/client/tradehistory/trades?${params.toString()}`, {
    method: 'GET',
    headers: getMT5Headers()
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.Message || data.error || `Failed to fetch trades: ${res.status}`
    );
  }
  return { success: true, data };
};

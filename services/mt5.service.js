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
    Balance: balance,
    Comment: comment
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
    Balance: balance,
    Comment: comment
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
    Balance: balance,
    Comment: comment
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
    Balance: balance,
    Comment: comment
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
 * GET /Users/{login}/getClientBalance
 */
export const getClientBalance = async (login) => {
  const res = await fetch(
    `${MT5_BASE_URL}/Users/${login}/getClientBalance`,
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


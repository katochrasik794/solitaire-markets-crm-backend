import dotenv from 'dotenv';

dotenv.config();

/**
 * MT5 Service
 * Handles all MT5 API interactions according to the official API documentation
 */

// Base URLs from environment or defaults
const MT5_MANAGER_BASE_URL = process.env.MT5_LIVE_API_URL || process.env.MT5_API_URL || 'http://18.175.242.21:5003/api';
const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://metaapi.zuperior.com';
const MT5_GROUPS_SYNC_URL = process.env.MT5_GROUPS_SYNC_URL || 'http://18.175.242.21:3000';

/**
 * Get common headers for MT5 API requests
 */
const getMT5Headers = () => {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add authentication if available
  if (process.env.MT5_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.MT5_API_KEY}`;
  }
  if (process.env.MT5_API_TOKEN) {
    headers['X-API-Token'] = process.env.MT5_API_TOKEN;
  }
  if (process.env.METAAPI_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.METAAPI_API_KEY}`;
  }
  if (process.env.METAAPI_TOKEN) {
    headers['X-API-Token'] = process.env.METAAPI_TOKEN;
  }

  return headers;
};

/**
 * ============================================
 * MT5 Manager API (Main Service)
 * Base URL: http://18.175.242.21:5003/api
 * ============================================
 */

/**
 * 1.1 Get Groups
 * GET /Groups
 * Retrieves a list of all available MT5 groups
 */
export const getGroups = async () => {
  try {
    const response = await fetch(`${MT5_MANAGER_BASE_URL}/Groups`, {
      method: 'GET',
      headers: getMT5Headers(),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to fetch groups: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Get MT5 Groups error:', error);
    throw error;
  }
};

/**
 * 1.2 Create Account
 * POST /Users
 * Creates a new MT5 account
 * 
 * @param {Object} accountData - Account creation data
 * @param {string} accountData.name - Account name
 * @param {string} accountData.group - MT5 group name
 * @param {number} accountData.leverage - Leverage (e.g., 50, 100, 200)
 * @param {string} accountData.masterPassword - Master password
 * @param {string} accountData.investorPassword - Investor password
 * @param {string} accountData.email - User email
 * @param {string} accountData.country - User country
 * @param {string} accountData.city - User city
 * @param {string} accountData.phone - User phone
 * @param {string} accountData.comment - Account comment/reason
 */
export const createAccount = async (accountData) => {
  try {
    const payload = {
      name: accountData.name,
      group: accountData.group,
      leverage: accountData.leverage,
      masterPassword: accountData.masterPassword,
      investorPassword: accountData.investorPassword,
      email: accountData.email,
      country: accountData.country || '',
      city: accountData.city || '',
      phone: accountData.phone || '',
      comment: accountData.comment || 'Created via API',
    };

    console.log('Creating MT5 account:', JSON.stringify(payload, null, 2));

    const response = await fetch(`${MT5_MANAGER_BASE_URL}/Users`, {
      method: 'POST',
      headers: getMT5Headers(),
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('MT5 API response is not JSON:', responseText);
      throw new Error(`Invalid response from MT5 API (Status ${response.status}): ${responseText.substring(0, 500)}`);
    }

    if (!response.ok) {
      const errorMsg = data.message || data.error || data.msg || JSON.stringify(data);
      throw new Error(`MT5 API error (Status ${response.status}): ${errorMsg}`);
    }

    if (data.error || data.status === 'error') {
      const errorMsg = data.message || data.error || JSON.stringify(data);
      throw new Error(`MT5 API returned error: ${errorMsg}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Create MT5 account error:', error);
    throw error;
  }
};

/**
 * 1.3 Add Balance (Deposit)
 * POST /Users/{login}/AddClientBalance
 * Adds funds to a user's account
 * 
 * @param {number} login - MT5 account login number
 * @param {number} balance - Amount to add
 * @param {string} comment - Transaction comment
 */
export const addBalance = async (login, balance, comment = 'Deposit via API') => {
  try {
    const payload = {
      balance: balance,
      comment: comment,
    };

    const response = await fetch(`${MT5_MANAGER_BASE_URL}/Users/${login}/AddClientBalance`, {
      method: 'POST',
      headers: getMT5Headers(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to add balance: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Add MT5 balance error:', error);
    throw error;
  }
};

/**
 * 1.4 Deduct Balance (Withdraw)
 * POST /Users/{login}/DeductClientBalance
 * Deducts funds from a user's account
 * 
 * @param {number} login - MT5 account login number
 * @param {number} balance - Amount to deduct
 * @param {string} comment - Transaction comment
 */
export const deductBalance = async (login, balance, comment = 'Withdrawal via API') => {
  try {
    const payload = {
      balance: balance,
      comment: comment,
    };

    const response = await fetch(`${MT5_MANAGER_BASE_URL}/Users/${login}/DeductClientBalance`, {
      method: 'POST',
      headers: getMT5Headers(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to deduct balance: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Deduct MT5 balance error:', error);
    throw error;
  }
};

/**
 * 1.5 Get User Profile
 * GET /client/getClientBalance/{login} (Primary)
 * GET /Users/{login}/getClientBalance (Secondary)
 * Retrieves the profile and balance information for a specific user
 * 
 * @param {number} login - MT5 account login number
 */
export const getUserProfile = async (login) => {
  try {
    // Try primary endpoint first
    let response = await fetch(`${MT5_MANAGER_BASE_URL}/client/getClientBalance/${login}?_t=${Date.now()}`, {
      method: 'GET',
      headers: getMT5Headers(),
    });

    // If primary fails, try secondary endpoint
    if (!response.ok) {
      response = await fetch(`${MT5_MANAGER_BASE_URL}/Users/${login}/getClientBalance?_t=${Date.now()}`, {
        method: 'GET',
        headers: getMT5Headers(),
      });
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to get user profile: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Get MT5 user profile error:', error);
    throw error;
  }
};

/**
 * 1.6 Update User
 * PUT /Users/{login}
 * Updates an existing user's profile information
 * 
 * @param {number} login - MT5 account login number
 * @param {Object} updateData - User update data
 */
export const updateUser = async (login, updateData) => {
  try {
    const payload = {
      name: updateData.name,
      group: updateData.group,
      email: updateData.email,
      country: updateData.country || '',
      city: updateData.city || '',
      phone: updateData.phone || '',
      leverage: updateData.leverage,
      comment: updateData.comment || '',
    };

    const response = await fetch(`${MT5_MANAGER_BASE_URL}/Users/${login}`, {
      method: 'PUT',
      headers: getMT5Headers(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to update user: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Update MT5 user error:', error);
    throw error;
  }
};

/**
 * 1.7 Change Password
 * PUT /Security/users/{login}/password/change
 * Changes the password for a user account
 * 
 * @param {number} login - MT5 account login number
 * @param {string} newPassword - New password
 * @param {string} passwordType - "main" or "investor" (default: "main")
 */
export const changePassword = async (login, newPassword, passwordType = 'main') => {
  try {
    const response = await fetch(
      `${MT5_MANAGER_BASE_URL}/Security/users/${login}/password/change?passwordType=${passwordType}`,
      {
        method: 'PUT',
        headers: getMT5Headers(),
        body: JSON.stringify(newPassword),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to change password: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Change MT5 password error:', error);
    throw error;
  }
};

/**
 * 1.8 Client Login (Get Access Token)
 * POST /client/ClientAuth/login
 * Authenticates a client and retrieves an access token
 * 
 * @param {number} accountId - MT5 account ID
 * @param {string} password - Account password
 * @param {string} deviceId - Device ID
 * @param {string} deviceType - Device type (default: "server")
 */
export const clientLogin = async (accountId, password, deviceId = 'server-device', deviceType = 'server') => {
  try {
    const payload = {
      AccountId: accountId,
      Password: password,
      DeviceId: deviceId,
      DeviceType: deviceType,
    };

    const response = await fetch(`${MT5_MANAGER_BASE_URL}/client/ClientAuth/login`, {
      method: 'POST',
      headers: getMT5Headers(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to login: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('MT5 client login error:', error);
    throw error;
  }
};

/**
 * ============================================
 * MetaApi (IB Backend)
 * Base URL: https://metaapi.zuperior.com
 * ============================================
 */

/**
 * 2.1 Client Login (MetaApi)
 * POST /api/client/ClientAuth/login
 * Authenticates a client to the MetaApi service
 */
export const metaApiClientLogin = async (accountId, password, deviceId = 'server-device', deviceType = 'server') => {
  try {
    const payload = {
      AccountId: accountId,
      Password: password,
      DeviceId: deviceId,
      DeviceType: deviceType,
    };

    const response = await fetch(`${METAAPI_BASE_URL}/api/client/ClientAuth/login`, {
      method: 'POST',
      headers: getMT5Headers(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to login to MetaApi: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('MetaApi client login error:', error);
    throw error;
  }
};

/**
 * 2.2 Get Closed Trades
 * GET /api/client/tradehistory/trades-closed
 * Retrieves closed trade history for an account
 * 
 * @param {number} accountId - MT5 account ID
 * @param {string} fromDate - Start date (ISO string)
 * @param {string} toDate - End date (ISO string)
 * @param {number} page - Page number
 * @param {number} pageSize - Number of items per page
 */
export const getClosedTrades = async (accountId, fromDate, toDate, page = 1, pageSize = 50) => {
  try {
    const params = new URLSearchParams({
      accountId: accountId.toString(),
      fromDate: fromDate,
      toDate: toDate,
      page: page.toString(),
      pageSize: pageSize.toString(),
    });

    const response = await fetch(`${METAAPI_BASE_URL}/api/client/tradehistory/trades-closed?${params}`, {
      method: 'GET',
      headers: getMT5Headers(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to get closed trades: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Get closed trades error:', error);
    throw error;
  }
};

/**
 * 2.3 Get All Trades
 * GET /api/client/tradehistory/trades
 * Retrieves all trade history for an account
 * 
 * @param {number} accountId - MT5 account ID
 * @param {number} page - Page number
 * @param {number} pageSize - Number of items per page
 * @param {string} fromDate - Start date (ISO string, optional)
 * @param {string} toDate - End date (ISO string, optional)
 */
export const getAllTrades = async (accountId, page = 1, pageSize = 50, fromDate = null, toDate = null) => {
  try {
    const params = new URLSearchParams({
      accountId: accountId.toString(),
      page: page.toString(),
      pageSize: pageSize.toString(),
    });

    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);

    const response = await fetch(`${METAAPI_BASE_URL}/api/client/tradehistory/trades?${params}`, {
      method: 'GET',
      headers: getMT5Headers(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to get trades: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Get all trades error:', error);
    throw error;
  }
};

/**
 * 2.4 Get Client Profile (MetaApi)
 * GET /api/Users/{accountId}/getClientProfile
 * Retrieves client profile information, specifically used to resolve the Group ID
 * 
 * @param {number} accountId - MT5 account ID
 */
export const getClientProfile = async (accountId) => {
  try {
    const response = await fetch(`${METAAPI_BASE_URL}/api/Users/${accountId}/getClientProfile`, {
      method: 'GET',
      headers: getMT5Headers(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to get client profile: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Get client profile error:', error);
    throw error;
  }
};

/**
 * ============================================
 * MT5 Groups Sync (Alternative)
 * Base URL: http://18.175.242.21:3000
 * ============================================
 */

/**
 * 3.1 Get Groups (Sync)
 * GET /api/Groups
 * Retrieves a list of MT5 groups for synchronization
 */
export const getGroupsSync = async () => {
  try {
    const response = await fetch(`${MT5_GROUPS_SYNC_URL}/api/Groups`, {
      method: 'GET',
      headers: getMT5Headers(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Failed to fetch groups: ${response.status}`);
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Get MT5 groups sync error:', error);
    throw error;
  }
};



const User = require("../models/User");
const AppError = require("../utils/AppError");
const {
  hashPassword,
  comparePassword,
} = require("../utils/password");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");

/**
 * Register a new user
 * @param {object} userData - User data (email, name, password)
 * @returns {object} - User object with tokens
 * @throws {Error} - If validation fails or user already exists
 */
async function registerUser(userData) {
  const { email, name, password } = userData;

  // Validation
  if (!email || !name || !password) {
    throw new AppError("Email, name, and password are required", 400);
  }

  if (password.length < 8) {
    throw new AppError("Password must be at least 8 characters long", 400);
  }

  // Check if user already exists
  const existingUser = await User.findOne({
    email: email.toLowerCase(),
  });
  if (existingUser) {
    throw new AppError("User with this email already exists", 409);
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const newUser = new User({
    email: email.toLowerCase(),
    name,
    password: hashedPassword,
  });

  const savedUser = await newUser.save();
  const user = savedUser.toJSON();

  // Generate tokens
  const tokenPayload = {
    id: user.id,
    email: user.email,
  };

  const access_token = generateAccessToken(tokenPayload);
  const refresh_token = generateRefreshToken(tokenPayload);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    token: {
      access_token,
      refresh_token,
    },
  };
}

/**
 * Login a user
 * @param {object} credentials - Login credentials (email, password)
 * @returns {object} - User object with tokens
 * @throws {Error} - If credentials are invalid
 */
async function loginUser(credentials) {
  const { email, password } = credentials;

  // Validation
  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  // Find user
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password"
  );
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  // Generate tokens
  const tokenPayload = {
    id: user.id,
    email: user.email,
  };

  const access_token = generateAccessToken(tokenPayload);
  const refresh_token = generateRefreshToken(tokenPayload);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      uuid: user.uuid,
    },
    token: {
      access_token,
      refresh_token,
    },
  };
}

/**
 * Refresh access token
 * @param {string} refreshToken - Refresh token
 * @returns {object} - New access token
 * @throws {Error} - If refresh token is invalid or user not found
 */
async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new AppError("Refresh token is required", 400);
  }

  // Verify refresh token
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    throw new AppError("Invalid or expired refresh token", 403);
  }

  // Find user to ensure they still exist
  const user = await User.findById(decoded.id);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Generate new access token
  const tokenPayload = {
    id: user.id,
    email: user.email,
  };

  const access_token = generateAccessToken(tokenPayload);

  return {
    access_token,
  };
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {object} - User object without password
 * @throws {Error} - If user not found
 */
async function getUserById(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Return user without password (MongoDB model handles this via toJSON)
  return user.toJSON();
}

module.exports = {
  registerUser,
  loginUser,
  refreshAccessToken,
  getUserById,
};


// ================================================================
// SOCKET AUTHENTICATION MIDDLEWARE (middleware/socketAuth.js)
// ================================================================
// PURPOSE: Protects WebSocket (Socket.io) connections.
//
// WHAT IS SOCKET.IO?
//   Socket.io provides REAL-TIME communication between server and browser.
//   Unlike HTTP (request → response), sockets stay connected and can
//   push updates instantly (e.g., "someone just edited cell A3").
//
// WHY AUTHENTICATE SOCKETS?
//   Without this, anyone could connect to the WebSocket and
//   receive real-time updates or send fake data.
//   This middleware checks the JWT token ONCE when the socket connects.
//
// HOW IT WORKS:
//   1. Frontend connects: io('http://localhost:5001', { auth: { token: JWT } })
//   2. This middleware intercepts the connection attempt
//   3. Verifies the JWT token (same as HTTP auth)
//   4. Attaches user info to the socket for use in event handlers
//   5. If invalid → connection is rejected
//
// USED IN: server.js → io.use(authenticateSocket)
// ================================================================

const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'construction-tracker-default-dev-secret-key-2024';

// Runs once per socket connection attempt — verifies the user's JWT token
const authenticateSocket = async (socket, next) => {
  try {
    // The frontend sends the token in socket.handshake.auth.token
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }

    // Decode the JWT to get userId, email, role
    const decoded = jwt.verify(token, JWT_SECRET);

    // Look up the user in the database
    const user = await User.findByPk(decoded.userId);

    if (!user || !user.isActive) {
      return next(new Error('User not found or inactive'));
    }

    // Attach user info to the socket — available in all event handlers
    // e.g., socket.userId, socket.userRole can be used in io.on('connection')
    socket.userId = user.id;
    socket.userRole = user.role;
    socket.user = user;
    
    next(); // Allow the connection
  } catch (error) {
    next(new Error('Authentication error')); // Reject the connection
  }
};

module.exports = { authenticateSocket };
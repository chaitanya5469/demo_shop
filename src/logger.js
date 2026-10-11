/**
 * logger.js — Winston logger with console, file, and Slack alerter transports.
 * Requires SLACK_WEBHOOK_URL env var for Slack alerts (optional).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { SlackAlerterTransport } = require('./alerter');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, stack }) => {
          return `${timestamp} [${level}]: ${message}${stack ? '\n' + stack : ''}`;
        })
      )
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      format: winston.format.json()
    }),
    new SlackAlerterTransport()
  ]
});

module.exports = logger;

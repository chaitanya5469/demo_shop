/**
 * alerter.js — Winston transport / error hook.
 *
 * On error-level logs it posts to SLACK_WEBHOOK_URL a message starting
 * with `ALERT`, including the service name, error summary, count, and
 * the last 15 log lines.
 *
 * Rate limit: at most one alert per 60s per error signature.
 * If SLACK_WEBHOOK_URL is unset, prints the alert to console instead.
 */

const Transport = require('winston-transport');
const path = require('path');
const fs = require('fs');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SERVICE_NAME = 'checkout-service';
const RATE_LIMIT_MS = 60 * 1000; // 60 seconds

// Track rate limits per error signature
const lastAlertTime = new Map();

// Recent log buffer (keeps last 15 lines)
const recentLogs = [];
const MAX_LOG_BUFFER = 15;

function addToBuffer(logEntry) {
  recentLogs.push(logEntry);
  if (recentLogs.length > MAX_LOG_BUFFER) {
    recentLogs.shift();
  }
}

function getErrorSignature(message) {
  // Normalize to detect same-type errors
  return message.replace(/\d+/g, 'N').substring(0, 80);
}

async function postToSlack(alertText) {
  if (!SLACK_WEBHOOK_URL) {
    console.log('\n[ALERTER - no webhook configured, printing to console]\n');
    console.log(alertText);
    console.log('\n');
    return;
  }

  try {
    // Use dynamic import for node-fetch v2 compatibility
    const fetch = require('node-fetch');
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: alertText }),
    });
    if (!response.ok) {
      console.error(`[ALERTER] Slack webhook failed: ${response.status} ${response.statusText}`);
    } else {
      console.log('[ALERTER] Alert posted to Slack #alerts');
    }
  } catch (err) {
    console.error('[ALERTER] Failed to post to Slack:', err.message);
  }
}

class SlackAlerterTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.level = 'error';
    this.errorCount = 0;
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    // Add to recent log buffer
    addToBuffer(JSON.stringify(info));

    if (info.level === 'error') {
      this.errorCount++;
      const sig = getErrorSignature(info.message || '');
      const now = Date.now();
      const last = lastAlertTime.get(sig) || 0;

      if (now - last < RATE_LIMIT_MS) {
        callback();
        return; // Rate limited
      }

      lastAlertTime.set(sig, now);

      const logSnippet = recentLogs.join('\n');
      const alertText = [
        `ALERT: ${SERVICE_NAME} — ${info.message}`,
        `Error count: ${this.errorCount}`,
        `Timestamp: ${info.timestamp || new Date().toISOString()}`,
        `Stack: ${info.stack || 'N/A'}`,
        ``,
        `Last ${recentLogs.length} log lines:`,
        '```',
        logSnippet,
        '```',
      ].join('\n');

      postToSlack(alertText).catch(console.error);
    }

    callback();
  }
}

// Also export addToBuffer so logger.js can use it
module.exports = { SlackAlerterTransport, addToBuffer };

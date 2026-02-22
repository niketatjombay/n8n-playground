const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'n8n', 'logs');
const LOG_PATH = path.join(LOG_DIR, 'activity.json');

function readLog() {
  if (!fs.existsSync(LOG_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeLog(entries) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2) + '\n');
}

function logActivity(entry) {
  const log = readLog();
  log.unshift({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (log.length > 500) log.length = 500;
  writeLog(log);
}

function getActivityLog({ limit = 50, slug, action } = {}) {
  let log = readLog();
  if (slug) log = log.filter(e => e.slug === slug);
  if (action) log = log.filter(e => e.action === action);
  return log.slice(0, limit);
}

module.exports = { logActivity, getActivityLog };

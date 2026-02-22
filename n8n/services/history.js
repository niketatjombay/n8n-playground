const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getWorkflowFilePath(slug, env) {
  return path.join(process.cwd(), 'n8n', 'workflows', env, slug, 'main_workflow.json');
}

function getHistory({ slug, env, limit = 20 }) {
  const filePath = getWorkflowFilePath(slug, env);
  const relPath = path.relative(process.cwd(), filePath);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${relPath}` };
  }

  try {
    const log = execSync(
      `git log --format="%H|%s|%an|%aI" -n ${limit} -- "${relPath}"`,
      { cwd: process.cwd(), encoding: 'utf8' }
    ).trim();

    if (!log) {
      return { success: true, slug, env, commits: [] };
    }

    const commits = log.split('\n').map(line => {
      const [hash, subject, author, date] = line.split('|');
      return { hash, subject, author, date };
    });

    return { success: true, slug, env, file: relPath, commits };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getVersion({ slug, env, commitHash }) {
  const filePath = getWorkflowFilePath(slug, env);
  const relPath = path.relative(process.cwd(), filePath);

  try {
    const content = execSync(
      `git show ${commitHash}:"${relPath}"`,
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    return { success: true, slug, env, commitHash, content: JSON.parse(content) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { getHistory, getVersion };

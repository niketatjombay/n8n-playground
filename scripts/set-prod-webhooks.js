const { readMetadata, writeMetadata } = require('../n8n/lib/metadata');
const m = readMetadata();

const webhookPaths = {
  'pre-work-summary': '/pre-work-summary',
  'session-slides': '/session-slides',
  'case-study-creator': '/case-study-creator',
  'document-summary-extractor': '/document-summary-extractor',
  'project-memory-updater': '/project-memory-updater',
};

function walk(folders) {
  for (const folder of (folders || [])) {
    if (folder.environment === 'production') {
      for (const wf of (folder.workflows || [])) {
        if (wf.slug in webhookPaths) {
          wf.webhookPath = webhookPaths[wf.slug];
          console.log('Set', wf.slug, '->', wf.webhookPath);
        }
      }
    }
    walk(folder.folders);
  }
}

walk(m.folders);
writeMetadata(m);
console.log('Done');

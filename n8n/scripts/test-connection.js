#!/usr/bin/env node
/**
 * Test n8n API Connection
 */

const { loadEnv } = require('../lib/env-loader');
loadEnv();

const N8nClient = require('../lib/n8n-client');

async function testConnection() {
  try {
    console.log('Testing n8n connection...\n');

    const client = new N8nClient();
    const workflows = await client.getAllWorkflows();

    console.log('Connection successful!');
    console.log(`Found ${workflows.data.length} workflow(s)\n`);

    if (workflows.data.length > 0) {
      console.log('Workflows:');
      workflows.data.forEach((wf, i) => {
        console.log(`${i + 1}. ${wf.name} (${wf.active ? 'Active' : 'Inactive'})`);
      });
    }

  } catch (error) {
    console.error('Connection failed:', error.message);
    console.error('\nCheck:');
    console.error('1. N8N_API_KEY is set in .env.local');
    console.error('2. N8N_BASE_URL is correct');
    console.error('3. n8n is running');
    process.exit(1);
  }
}

testConnection();

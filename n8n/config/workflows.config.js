/**
 * Workflow Configuration
 * Define your workflow requirements here
 */

module.exports = {
  // Workflow definitions for your Next.js app
  workflows: [
    {
      name: 'User Registration Handler',
      description: 'Process new user registrations',
      webhookPath: 'user-registration',
      enabled: true
    },
    {
      name: 'Daily Report Generator',
      description: 'Generate and email daily reports',
      schedule: '0 9 * * *', // 9 AM daily
      enabled: true
    },
    {
      name: 'Contact Form Handler',
      description: 'Process contact form submissions',
      webhookPath: 'contact-form',
      enabled: true
    }
  ],

  // Default settings
  defaults: {
    timezone: 'Asia/Kolkata',
    executionTimeout: 3600,
    saveExecutions: true
  }
};

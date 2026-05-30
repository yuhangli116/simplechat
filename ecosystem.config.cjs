module.exports = {
  apps: [{
    name: 'simplechat',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
  }],
};

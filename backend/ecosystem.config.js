module.exports = {
  apps: [
    {
      name: 'backend-dev',
      cwd: __dirname,
      script: 'bash',
      args: '-lc "yarn build && node dist/backend/src/index.js"',
      watch: ['src', '../shared'],
      ignore_watch: ['dist', 'node_modules'],
      watch_delay: 400,
      env: {
        NODE_ENV: 'development',
        PORT: 3201,
        SERVER_URL: 'ws://localhost:3200',
        SERVER_TOKEN: 'dev-token',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_USER: 'sam',
        DB_PASSWORD: '',
        DB_NAME: 'fileshare_dev',
        PGUSER: 'sam',
        PGPASSWORD: '',
        PGDATABASE: 'fileshare_dev'
      }
    }
  ]
}

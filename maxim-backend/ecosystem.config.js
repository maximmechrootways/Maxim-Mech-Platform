/** PM2: use the same startup as `npm start` (migrations + node) so Prisma CLI comes from node_modules. */
module.exports = {
    apps: [{
        name: 'maxim-backend',
        script: 'npm',
        args: 'start',
        cwd: __dirname,
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '512M',
        env_production: {
            NODE_ENV: 'production',
            PORT: 8080
        }
    }]
}

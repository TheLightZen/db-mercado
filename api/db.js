const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db-mercado-mercado-app.k.aivencloud.com',
  port: Number(process.env.DB_PORT) || 12112,
  user: process.env.DB_USER || 'avnadmin',
  password: process.env.DB_PASSWORD || 'AVNS_xFyEz06D9cIS1-UmMpP',
  database: process.env.DB_NAME || 'db_control_mercados3',
  waitForConnections: true,
  connectionLimit: 10,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
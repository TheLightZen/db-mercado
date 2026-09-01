const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Obtener datos de la vista de ingresos
app.get('/api/ingresos', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Vista_Resumen_Ingresos ORDER BY fechaEntrada DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener lista de comerciantes
app.get('/api/comerciantes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Vista_Ubicacion_Comerciantes');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar un ingreso mediante Stored Procedure
app.post('/api/ingresos', async (req, res) => {
  const { prod, peso, uni, dueno, prov, cat, pto, adminId } = req.body;
  try {
    await pool.query('CALL RegistrarIngreso(?, ?, ?, ?, ?, ?, ?, ?)', [
      prod, peso, uni, dueno, prov, cat, pto, adminId
    ]);
    res.status(201).json({ message: 'Ingreso registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query(`
      SELECT a.idAdministrador, a.rol, p.nombres, p.primerApellido, a.password_hash
      FROM administradores a
      JOIN Personas p ON a.Personas_idPersona = p.idPersona
      WHERE p.email = ?
    `, [email]);

    if (rows.length === 0 || rows[0].password_hash !== password) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const { password_hash, ...adminData } = rows[0];
    res.json({ message: 'Login exitoso', user: adminData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
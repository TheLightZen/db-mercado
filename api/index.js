const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'inicio.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});
app.get('/inicio', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'inicio.html'));
});

// ── Helper ───────────────────────────────────────────
const q = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

// ════════════════════════════════════════════════════
//  ENDPOINTS DE LECTURA (GET)
// ════════════════════════════════════════════════════


app.get('/api/ping', (_, res) => res.json({ ok: true }));


app.post('/api/login', async (req, res) => {
  try {
    const { ci, password } = req.body;

    const rows = await q(`
      SELECT
        a.idAdministrador,
        a.rol,
        p.ci,
        p.nombres,
        p.primerApellido
      FROM administradores a
      JOIN Personas p ON p.idPersona = a.Personas_idPersona
      WHERE p.ci = ?
        AND a.password_hash = ?
      LIMIT 1
    `, [ci, password]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    res.json({ ok: true, admin: rows[0] });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



app.get('/api/dashboard', async (_, res) => {
  try {
    const [ingresos] = await q('SELECT COUNT(*) AS total FROM ingreso_mercancia WHERE activo = 1');
    const [proveedores] = await q('SELECT COUNT(*) AS total FROM proveedores');
    const [duenos]      = await q('SELECT COUNT(*) AS total FROM dueno_puesto');
    const [categorias]  = await q('SELECT COUNT(*) AS total FROM categorias');
    const recientes     = await q(`
        SELECT im.idIngreso, im.nombreProducto, im.pesoCantidad, im.UnidadMedida,
       im.fechaEntrada, c.nombre_categoria,
       CONCAT(p.nombres, ' ', p.primerApellido) AS dueno
      FROM ingreso_mercancia im
      JOIN categorias c ON c.idCategoria = im.categorias_idCategoria
      JOIN dueno_puesto dp ON dp.idDueno = im.dueno_puesto_idDueno
      JOIN Personas p ON p.idPersona = dp.Personas_idPersona
      WHERE im.activo = 1
      ORDER BY im.fechaEntrada DESC LIMIT 8
    `);
    res.json({
      stats: {
        ingresos   : ingresos.total,
        proveedores: proveedores.total,
        duenos     : duenos.total,
        categorias : categorias.total,
      },
      recientes,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Catálogos simples
const simpleGet = (table, order = '') => async (_, res) => {
  try { res.json(await q(`SELECT * FROM ${table} ${order}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

app.get('/api/categorias',   simpleGet('categorias',   'ORDER BY nombre_categoria'));
app.get('/api/sectores', async (_, res) => {
  try {
    res.json(await q(`
      SELECT *
      FROM sector_mercado
      WHERE activo = 1
      ORDER BY nombre_sector
    `));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/departamentos', simpleGet('Departamento', 'ORDER BY nombreDepartamento'));
app.get('/api/telefonos',    simpleGet('telefonos'));
app.get('/api/puntos', async (_, res) => {
  try {
    res.json(await q(`
      SELECT 
        pc.idPunto,
        pc.nombre_punto,
        pc.administrador_idAdministrador,
        a.rol,
        CONCAT(p.nombres, ' ', p.primerApellido) AS encargado
      FROM punto_control pc
      JOIN administradores a ON a.idAdministrador = pc.administrador_idAdministrador
      JOIN Personas p ON p.idPersona = a.Personas_idPersona
      ORDER BY pc.nombre_punto
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/duenos', async (_, res) => {
  try {
    res.json(await q(`
      SELECT 
        dp.idDueno,
        dp.Personas_idPersona,
        p.ci,
        p.nombres,
        p.primerApellido,
        p.segundoApellido,
        CONCAT(p.nombres, ' ', p.primerApellido) AS nombre_completo,
        dp.idSector,
        dp.numero_puesto,
        sm.nombre_sector
      FROM dueno_puesto dp
      JOIN Personas p ON p.idPersona = dp.Personas_idPersona
      LEFT JOIN sector_mercado sm ON sm.idSector = dp.idSector
      WHERE dp.activo = 1
      ORDER BY p.nombres
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/proveedores', async (_, res) => {
  try {
    res.json(await q(`
      SELECT 
        pr.idProveedor,
        pr.nombre_proveedor,
        pr.idProcedencia,
        pr.placa_vehiculo,
        pr.idTelefono,
        t.numero AS celular,
        dep.nombreDepartamento,
        dep.municipio
      FROM proveedores pr
      LEFT JOIN telefonos t ON t.idTelefono = pr.idTelefono
      LEFT JOIN procedencias po ON po.idProcedencia = pr.idProcedencia
      LEFT JOIN Departamento dep ON dep.idDepartamento = po.idDepartamento
      WHERE pr.activo = 1
      ORDER BY pr.nombre_proveedor
    `));
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

app.get('/api/personas', async (_, res) => {
  try {
    res.json(await q(`
      SELECT 
        p.idPersona,
        p.ci,
        CONCAT(p.nombres, ' ', p.primerApellido) AS nombre_completo,
        t.numero AS telefono,

        CASE
          WHEN a.idAdministrador IS NOT NULL THEN 'Administrador'
          WHEN dp.idDueno IS NOT NULL THEN 'Dueño de Puesto'
          ELSE 'Persona'
        END AS rol

      FROM Personas p

      LEFT JOIN administradores a 
        ON a.Personas_idPersona = p.idPersona

      LEFT JOIN dueno_puesto dp 
        ON dp.Personas_idPersona = p.idPersona

      LEFT JOIN persona_telefono pt 
        ON pt.idPersona = p.idPersona

      LEFT JOIN telefonos t 
        ON t.idTelefono = pt.idTelefono

      ORDER BY p.primerApellido
    `));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});





app.get('/api/ingresos', async (_, res) => {
  try {
    res.json(await q(`
      SELECT 
        im.*,
        c.nombre_categoria,
        CONCAT(p.nombres, ' ', p.primerApellido) AS dueno,
        pr.nombre_proveedor AS proveedor,
        pc.nombre_punto,
        CONCAT(pa.nombres, ' ', pa.primerApellido) AS administrador
      FROM ingreso_mercancia im
      JOIN categorias c ON c.idCategoria = im.categorias_idCategoria
      JOIN dueno_puesto dp ON dp.idDueno = im.dueno_puesto_idDueno
      JOIN Personas p ON p.idPersona = dp.Personas_idPersona
      JOIN proveedores pr ON pr.idProveedor = im.proveedores_idProveedor
      JOIN punto_control pc ON pc.idPunto = im.punto_control_idPunto
      JOIN administradores a ON a.idAdministrador = im.administrador_idAdministrador
JOIN Personas pa ON pa.idPersona = a.Personas_idPersona
      WHERE im.activo = 1
      ORDER BY im.fechaEntrada DESC
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════
//  ENDPOINTS DE ESCRITURA (POST / PUT / DELETE)
// ════════════════════════════════════════════════════

// ── Categorías ──────────────────────────────────────
app.post('/api/categorias', async (req, res) => {
  try {
    const { nombre_categoria, descripcion } = req.body;
    await q('INSERT INTO categorias (nombre_categoria, descripcion) VALUES (?,?)', 
            [nombre_categoria, descripcion]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/categorias/:id', async (req, res) => {
  try {
    const { nombre_categoria, descripcion } = req.body;
    await q('UPDATE categorias SET nombre_categoria=?, descripcion=? WHERE idCategoria=?',
            [nombre_categoria, descripcion, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/categorias/:id', async (req, res) => {
  try {
    await q('DELETE FROM categorias WHERE idCategoria=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dueños ──────────────────────────────────────────
app.post('/api/duenos', async (req, res) => {
  try {

    const { 
      ci,
      nombres,
      primerApellido,
      segundoApellido,
      telefono,
      idSector,
      numero_puesto
    } = req.body;

    const resPersona = await q(`
      INSERT INTO Personas
      (ci, nombres, primerApellido, segundoApellido)
      VALUES (?, ?, ?, ?)
    `, [
      ci,
      nombres,
      primerApellido,
      segundoApellido
    ]);

    const nuevoIdPersona = resPersona.insertId;

    /* ===== TELEFONO ===== */

    if (telefono && telefono.trim() !== '') {

      const resTelefono = await q(`
        INSERT INTO telefonos (numero)
        VALUES (?)
      `, [telefono.trim()]);

      await q(`
        INSERT INTO persona_telefono
        (idPersona, idTelefono)
        VALUES (?, ?)
      `, [
        nuevoIdPersona,
        resTelefono.insertId
      ]);
    }

    /* ===== DUEÑO ===== */

    await q(`
      INSERT INTO dueno_puesto
      (Personas_idPersona, idSector, numero_puesto)
      VALUES (?, ?, ?)
    `, [
      nuevoIdPersona,
      idSector || null,
      numero_puesto
    ]);

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/duenos/:id', async (req, res) => {
  try {
    const idDueno = req.params.id;
    const { ci, nombres, primerApellido, segundoApellido, idSector, numero_puesto } = req.body;
    const duenoActual = await q('SELECT Personas_idPersona FROM dueno_puesto WHERE idDueno = ?', [idDueno]);
    if (duenoActual.length === 0) {
      return res.status(404).json({ error: 'Dueño no encontrado' });
    }
    const idPersona = duenoActual[0].Personas_idPersona;
    await q(`
      UPDATE Personas 
      SET ci = ?, nombres = ?, primerApellido = ?, segundoApellido = ? 
      WHERE idPersona = ?`,
      [ci, nombres, primerApellido, segundoApellido, idPersona]);

    await q(`
      UPDATE dueno_puesto 
      SET idSector = ?, numero_puesto = ? 
      WHERE idDueno = ?`,
      [idSector || null, numero_puesto, idDueno]);

    res.json({ ok: true });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

app.delete('/api/duenos/:id', async (req, res) => {
  try {
    await q(`
      UPDATE dueno_puesto
      SET activo = 0
      WHERE idDueno = ?
    `, [req.params.id]);

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Proveedores ─────────────────────────────────────
app.post('/api/proveedores', async (req, res) => {
  try {
    const { nombre_proveedor, celular, placa_vehiculo } = req.body;

    if (!nombre_proveedor) {
      return res.status(400).json({ error: 'Ingrese el nombre del proveedor' });
    }

    let idTelefono = null;

    if (celular && celular.trim() !== '') {
      const resultTel = await q(
        'INSERT INTO telefonos (numero) VALUES (?)',
        [celular.trim()]
      );

      idTelefono = resultTel.insertId;
    }

    await q(`
      INSERT INTO proveedores 
      (nombre_proveedor, idProcedencia, placa_vehiculo, idTelefono)
      VALUES (?, ?, ?, ?)
    `, [
      nombre_proveedor,
      null,
      placa_vehiculo || null,
      idTelefono
    ]);

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/proveedores/:id', async (req, res) => {
  try {
    const { nombre_proveedor, idProcedencia, placa_vehiculo, celular } = req.body;
    await q('UPDATE proveedores SET nombre_proveedor=?, idProcedencia=?, placa_vehiculo=?, celular=? WHERE idProveedor=?',
            [nombre_proveedor, idProcedencia || null, placa_vehiculo || null, celular || null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/proveedores/:id', async (req, res) => {
  try {
    await q(`
      UPDATE proveedores
      SET activo = 0
      WHERE idProveedor = ?
    `, [req.params.id]);

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Ingreso de Mercancía (principal) ─────────────────
app.post('/api/ingresos', async (req, res) => {
  try {
    const {
      nombreProducto, pesoCantidad, UnidadMedida,
      fechaEntrada, observaciones,
      dueno_puesto_idDueno, proveedores_idProveedor,
      categorias_idCategoria, punto_control_idPunto, usuarios_idUsuario // Viene mapeado desde el front
    } = req.body;
    await q(`INSERT INTO ingreso_mercancia 
             (nombreProducto, pesoCantidad, UnidadMedida, fechaEntrada, observaciones, 
              dueno_puesto_idDueno, proveedores_idProveedor, categorias_idCategoria, punto_control_idPunto, administrador_idAdministrador, activo) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, 
            [
              nombreProducto, pesoCantidad, UnidadMedida, fechaEntrada, observaciones, 
              dueno_puesto_idDueno, proveedores_idProveedor, categorias_idCategoria, punto_control_idPunto, usuarios_idUsuario
            ]);

    res.json({ ok: true });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

app.put('/api/ingresos/:id', async (req, res) => {
  try {
    const {
      nombreProducto, pesoCantidad, UnidadMedida,
      fechaEntrada, observaciones,
      dueno_puesto_idDueno, proveedores_idProveedor,
      categorias_idCategoria, punto_control_idPunto, usuarios_idUsuario // Viene mapeado desde el front
    } = req.body;

    await q(`UPDATE ingreso_mercancia SET
             nombreProducto=?, pesoCantidad=?, UnidadMedida=?,
             fechaEntrada=?, observaciones=?,
             dueno_puesto_idDueno=?, proveedores_idProveedor=?,
             categorias_idCategoria=?, punto_control_idPunto=?, administrador_idAdministrador=?
             WHERE idIngreso=?`,
            [
              nombreProducto, pesoCantidad, UnidadMedida,
              fechaEntrada, observaciones,
              dueno_puesto_idDueno, proveedores_idProveedor,
              categorias_idCategoria, punto_control_idPunto, usuarios_idUsuario,
              req.params.id
            ]);
            
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ingresos/:id', async (req, res) => {
  try {
    await q(`
      UPDATE ingreso_mercancia
      SET activo = 0
      WHERE idIngreso = ?
    `, [req.params.id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════





app.post('/api/sectores', async (req, res) => {
  try {
    const { nombre_sector, descripcion } = req.body;

    if (!nombre_sector) {
      return res.status(400).json({ error: 'Ingrese el nombre del sector' });
    }

    await q(`
      INSERT INTO sector_mercado (nombre_sector, descripcion)
      VALUES (?, ?)
    `, [nombre_sector, descripcion || null]);

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/sectores/:id', async (req, res) => {
  try {
    const { nombre_sector, descripcion } = req.body;

    await q(`
      UPDATE sector_mercado
      SET nombre_sector = ?,
          descripcion = ?
      WHERE idSector = ?
    `, [nombre_sector, descripcion || null, req.params.id]);

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/sectores/:id', async (req, res) => {
  try {
    const usados = await q(`
      SELECT COUNT(*) AS total
      FROM dueno_puesto
      WHERE idSector = ?
        AND activo = 1
    `, [req.params.id]);

    if (usados[0].total > 0) {
      return res.status(400).json({
        error: 'No se puede desactivar el sector porque tiene dueños activos'
      });
    }

    await q(`
      UPDATE sector_mercado
      SET activo = 0
      WHERE idSector = ?
    `, [req.params.id]);

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = app;
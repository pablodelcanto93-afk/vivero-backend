const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const PDFDocument = require('pdfkit');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:Pdelcanto1993@db.pqvmuqjkghbclginhdyn.supabase.co:5432/postgres';
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.get(['/', '/index', '/catalogo'], (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    const catalogoPath = path.join(__dirname, 'public', 'catalogo.html');
    const target = fs.existsSync(indexPath) ? indexPath : catalogoPath;
    res.sendFile(target);
});
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(session({
    secret: 'vivero_sol_y_sombra_secret_key_2026',
    resave: false,
    saveUninitialized: false
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

const PLANTAS_FILE = path.join(DATA_DIR, 'plantas.json');
const VENTAS_FILE = path.join(DATA_DIR, 'ventas.json');
const DESPACHOS_FILE = path.join(DATA_DIR, 'despachos.json');
const GASTOS_FILE = path.join(DATA_DIR, 'gastos.json');
const FACTURAS_FILE = path.join(DATA_DIR, 'facturas.json');

function leerJSON(file) {
    if (!fs.existsSync(file)) return [];
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data || '[]');
    } catch (error) {
        return [];
    }
}

function guardarJSON(file, data) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempFile = `${file}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, file);
}

function fechaLocalISO(date = new Date()) {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString();
}

function fechaLocalInput(date = new Date()) {
    const d = new Date(date);
    const pad = (valor) => String(valor).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalizarFechaLocal(fecha) {
    if (!fecha) return '';
    const texto = String(fecha);
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
    const date = new Date(texto);
    if (Number.isNaN(date.getTime())) return texto.slice(0, 10);
    const pad = (valor) => String(valor).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function archivoFecha() {
    return new Date().toLocaleDateString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function formatearMonto(valor) {
    return Number(valor || 0).toLocaleString('es-CL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function toNumber(value, fallback = 0) {
    const num = Number(value ?? fallback);
    return Number.isFinite(num) ? num : fallback;
}

async function crearTablasDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS plantas (
            id TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            cientifico TEXT,
            categoria TEXT,
            ubicacion TEXT,
            precio NUMERIC(12,2) DEFAULT 0,
            stock INTEGER DEFAULT 0,
            riego TEXT,
            clima TEXT,
            cuidados TEXT,
            foto TEXT DEFAULT '/logo.png'
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ventas (
            id TEXT PRIMARY KEY,
            fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            vendedor TEXT,
            medio_pago TEXT,
            items JSONB NOT NULL DEFAULT '[]'::jsonb,
            total NUMERIC(12,2) DEFAULT 0
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS despachos (
            id TEXT PRIMARY KEY,
            fecha_creado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            cliente TEXT,
            direccion TEXT,
            telefono TEXT,
            detalle TEXT,
            monto NUMERIC(12,2) DEFAULT 0,
            estado_pago TEXT,
            estado_entrega TEXT
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS gastos (
            id TEXT PRIMARY KEY,
            fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            descripcion TEXT,
            categoria TEXT,
            monto NUMERIC(12,2) DEFAULT 0,
            medio_pago TEXT
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS facturas (
            id TEXT PRIMARY KEY,
            fecha DATE,
            proveedor TEXT,
            num_factura TEXT,
            monto_neto NUMERIC(12,2) DEFAULT 0,
            iva_recuperable NUMERIC(12,2) DEFAULT 0,
            total NUMERIC(12,2) DEFAULT 0,
            adjunto TEXT
        );
    `);
}

async function migrarDatosLocales() {
    const migraciones = [
        {
            table: 'plantas',
            file: PLANTAS_FILE,
            insert: `
                INSERT INTO plantas (id, nombre, cientifico, categoria, ubicacion, precio, stock, riego, clima, cuidados, foto)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO UPDATE SET
                    nombre = EXCLUDED.nombre,
                    cientifico = EXCLUDED.cientifico,
                    categoria = EXCLUDED.categoria,
                    ubicacion = EXCLUDED.ubicacion,
                    precio = EXCLUDED.precio,
                    stock = EXCLUDED.stock,
                    riego = EXCLUDED.riego,
                    clima = EXCLUDED.clima,
                    cuidados = EXCLUDED.cuidados,
                    foto = EXCLUDED.foto
            `
        },
        {
            table: 'ventas',
            file: VENTAS_FILE,
            insert: `
                INSERT INTO ventas (id, fecha, vendedor, medio_pago, items, total)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6)
                ON CONFLICT (id) DO UPDATE SET
                    fecha = EXCLUDED.fecha,
                    vendedor = EXCLUDED.vendedor,
                    medio_pago = EXCLUDED.medio_pago,
                    items = EXCLUDED.items,
                    total = EXCLUDED.total
            `
        },
        {
            table: 'despachos',
            file: DESPACHOS_FILE,
            insert: `
                INSERT INTO despachos (id, fecha_creado, cliente, direccion, telefono, detalle, monto, estado_pago, estado_entrega)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                    fecha_creado = EXCLUDED.fecha_creado,
                    cliente = EXCLUDED.cliente,
                    direccion = EXCLUDED.direccion,
                    telefono = EXCLUDED.telefono,
                    detalle = EXCLUDED.detalle,
                    monto = EXCLUDED.monto,
                    estado_pago = EXCLUDED.estado_pago,
                    estado_entrega = EXCLUDED.estado_entrega
            `
        },
        {
            table: 'gastos',
            file: GASTOS_FILE,
            insert: `
                INSERT INTO gastos (id, fecha, descripcion, categoria, monto, medio_pago)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET
                    fecha = EXCLUDED.fecha,
                    descripcion = EXCLUDED.descripcion,
                    categoria = EXCLUDED.categoria,
                    monto = EXCLUDED.monto,
                    medio_pago = EXCLUDED.medio_pago
            `
        },
        {
            table: 'facturas',
            file: FACTURAS_FILE,
            insert: `
                INSERT INTO facturas (id, fecha, proveedor, num_factura, monto_neto, iva_recuperable, total, adjunto)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO UPDATE SET
                    fecha = EXCLUDED.fecha,
                    proveedor = EXCLUDED.proveedor,
                    num_factura = EXCLUDED.num_factura,
                    monto_neto = EXCLUDED.monto_neto,
                    iva_recuperable = EXCLUDED.iva_recuperable,
                    total = EXCLUDED.total,
                    adjunto = EXCLUDED.adjunto
            `
        }
    ];

    for (const item of migraciones) {
        const rows = leerJSON(item.file);
        if (!rows.length) continue;

        for (const row of rows) {
            if (item.table === 'plantas') {
                await pool.query(item.insert, [
                    String(row.id ?? Date.now()),
                    row.nombre || '',
                    row.cientifico || '',
                    row.categoria || '',
                    row.ubicacion || '',
                    toNumber(row.precio, 0),
                    toNumber(row.stock, 0),
                    row.riego || '',
                    row.clima || '',
                    row.cuidados || '',
                    row.foto || '/logo.png'
                ]);
            } else if (item.table === 'ventas') {
                await pool.query(item.insert, [
                    String(row.id ?? Date.now()),
                    row.fecha ? new Date(row.fecha) : new Date(),
                    row.vendedor || 'Desconocido',
                    row.medioPago || 'Efectivo',
                    JSON.stringify(row.items || []),
                    toNumber(row.total, 0)
                ]);
            } else if (item.table === 'despachos') {
                await pool.query(item.insert, [
                    String(row.id ?? Date.now()),
                    row.fechaCreado ? new Date(row.fechaCreado) : new Date(),
                    row.cliente || '',
                    row.direccion || '',
                    row.telefono || '',
                    row.detalle || '',
                    toNumber(row.monto, 0),
                    row.estadoPago || 'Pendiente',
                    row.estadoEntrega || 'Pendiente'
                ]);
            } else if (item.table === 'gastos') {
                await pool.query(item.insert, [
                    String(row.id ?? Date.now()),
                    row.fecha ? new Date(row.fecha) : new Date(),
                    row.descripcion || '',
                    row.categoria || 'Insumos',
                    toNumber(row.monto, 0),
                    row.medioPago || 'Efectivo'
                ]);
            } else if (item.table === 'facturas') {
                await pool.query(item.insert, [
                    String(row.id ?? Date.now()),
                    row.fecha || fechaLocalInput(),
                    row.proveedor || '',
                    row.numFactura || '',
                    toNumber(row.montoNeto, 0),
                    toNumber(row.ivaRecuperable, 0),
                    toNumber(row.total, 0),
                    row.adjunto || null
                ]);
            }
        }
    }
}

async function initializeDatabase() {
    await pool.query('SELECT 1');
    await crearTablasDB();
    await migrarDatosLocales();
    console.log('Base de datos PostgreSQL inicializada correctamente.');
}

async function startServer() {
    await initializeDatabase();
    app.listen(PORT, () => {
        console.log(`Servidor activo en puerto ${PORT}`);
    });
}

// LOGIN
app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    if (usuario === 'pdelcanto' && password === '1234') {
        req.session.user = { usuario: 'pdelcanto', rol: 'admin', nombre: 'Pablo Del Canto' };
        return res.json({ success: true, rol: 'admin' });
    }
    if (usuario === 'vivero' && password === '1234') {
        req.session.user = { usuario: 'vivero', rol: 'trabajador', nombre: 'Trabajador' };
        return res.json({ success: true, rol: 'trabajador' });
    }
    res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
});

app.get('/api/session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

function requireAuth(req, res, next) {
    if (req.session.user) return next();
    return res.status(401).json({ error: 'No autorizado' });
}

function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.rol === 'admin') return next();
    return res.status(403).json({ error: 'Acceso denegado' });
}

// PLANTAS
app.get('/api/plantas', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM plantas ORDER BY nombre ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar las plantas.' });
    }
});

app.post('/api/plantas', requireAuth, upload.single('foto'), async (req, res) => {
    try {
        const { id, nombre, cientifico, categoria, ubicacion, precio, stock, riego, clima, cuidados } = req.body;
        const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const payload = {
            nombre: nombre || '',
            cientifico: cientifico || '',
            categoria: categoria || '',
            ubicacion: ubicacion || '',
            precio: toNumber(precio, 0),
            stock: toNumber(stock, 0),
            riego: riego || '',
            clima: clima || '',
            cuidados: cuidados || ''
        };

        if (id) {
            const existing = await pool.query('SELECT * FROM plantas WHERE id = $1', [String(id)]);
            if (existing.rowCount > 0) {
                await pool.query(`
                    UPDATE plantas
                    SET nombre = $1,
                        cientifico = $2,
                        categoria = $3,
                        ubicacion = $4,
                        precio = $5,
                        stock = $6,
                        riego = $7,
                        clima = $8,
                        cuidados = $9,
                        foto = COALESCE($10, foto)
                    WHERE id = $11
                `, [
                    payload.nombre,
                    payload.cientifico,
                    payload.categoria,
                    payload.ubicacion,
                    payload.precio,
                    payload.stock,
                    payload.riego,
                    payload.clima,
                    payload.cuidados,
                    fotoUrl || existing.rows[0].foto || '/logo.png',
                    String(id)
                ]);
                return res.json({ success: true });
            }
        }

        const nuevaId = String(Date.now());
        await pool.query(`
            INSERT INTO plantas (id, nombre, cientifico, categoria, ubicacion, precio, stock, riego, clima, cuidados, foto)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            nuevaId,
            payload.nombre,
            payload.cientifico,
            payload.categoria,
            payload.ubicacion,
            payload.precio,
            payload.stock,
            payload.riego,
            payload.clima,
            payload.cuidados,
            fotoUrl || '/logo.png'
        ]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo guardar la planta.' });
    }
});

app.delete('/api/plantas/:id', requireAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM plantas WHERE id = $1', [String(req.params.id)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo eliminar la planta.' });
    }
});

// VENTAS
app.get('/api/ventas', requireAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM ventas ORDER BY fecha DESC');
        res.json(rows.map(v => ({
            ...v,
            medioPago: v.medio_pago,
            items: Array.isArray(v.items) ? v.items : (v.items ? JSON.parse(v.items) : [])
        })));
    } catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar las ventas.' });
    }
});

app.post('/api/ventas', requireAuth, async (req, res) => {
    try {
        const { items, medioPago } = req.body;
        if (!items || items.length === 0) return res.status(400).json({ error: 'Sin items' });

        const ids = items.map(item => String(item.id));
        const plantasResult = await pool.query(`SELECT * FROM plantas WHERE id = ANY($1::text[])`, [ids]);
        const plantasMap = new Map(plantasResult.rows.map(p => [String(p.id), p]));

        let totalVenta = 0;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            for (const item of items) {
                const planta = plantasMap.get(String(item.id));
                if (!planta) continue;
                const cantidad = toNumber(item.cantidad, 0);
                const nuevoStock = Math.max(0, toNumber(planta.stock, 0) - cantidad);
                await client.query('UPDATE plantas SET stock = $1 WHERE id = $2', [nuevoStock, String(planta.id)]);
                totalVenta += toNumber(planta.precio, 0) * cantidad;
            }

            const ventaId = String(Date.now());
            await client.query(`
                INSERT INTO ventas (id, fecha, vendedor, medio_pago, items, total)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            `, [
                ventaId,
                new Date(),
                req.session.user ? req.session.user.usuario : 'Desconocido',
                medioPago || 'Efectivo',
                JSON.stringify(items),
                totalVenta
            ]);

            await client.query('COMMIT');
            res.json({ success: true });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: 'No se pudo registrar la venta.' });
    }
});

// REPORTES & CAJA
app.get('/api/reporte-admin', requireAdmin, async (req, res) => {
    try {
        const { rows: inventarioRows } = await pool.query('SELECT * FROM plantas');
        const fechaFiltro = req.query.fecha;

        const valorTotalInventario = inventarioRows.reduce((acc, p) => acc + (toNumber(p.precio, 0) * toNumber(p.stock, 0)), 0);
        const totalPlantasUnidades = inventarioRows.reduce((acc, p) => acc + toNumber(p.stock, 0), 0);

        let ventasRows = [];
        if (fechaFiltro) {
            const fechaFiltroLocal = String(fechaFiltro).slice(0, 10);
            const result = await pool.query(`
                SELECT *
                FROM ventas
                WHERE DATE(fecha AT TIME ZONE 'America/Santiago') = $1::date
                ORDER BY fecha DESC
            `, [fechaFiltroLocal]);
            ventasRows = result.rows;
        } else {
            const result = await pool.query('SELECT * FROM ventas ORDER BY fecha DESC');
            ventasRows = result.rows;
        }

        let totalEfectivo = 0;
        let totalTransferencia = 0;
        let totalDebito = 0;
        let totalRecaudadoVentas = 0;

        ventasRows.forEach(v => {
            const total = toNumber(v.total, 0);
            totalRecaudadoVentas += total;
            const medio = (v.medio_pago || 'efectivo').toLowerCase();
            if (medio.includes('efectivo')) totalEfectivo += total;
            else if (medio.includes('transferencia')) totalTransferencia += total;
            else totalDebito += total;
        });

        res.json({
            valorTotalInventario,
            totalPlantasUnidades,
            totalRecaudadoVentas,
            caja: { efectivo: totalEfectivo, transferencia: totalTransferencia, debito: totalDebito },
            cantidadVentas: ventasRows.length
        });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo generar el reporte.' });
    }
});

// GASTOS
app.get('/api/gastos', requireAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM gastos ORDER BY fecha DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar los gastos.' });
    }
});

app.post('/api/gastos', requireAdmin, async (req, res) => {
    try {
        const { descripcion, categoria, monto, medioPago } = req.body;
        await pool.query(`
            INSERT INTO gastos (id, fecha, descripcion, categoria, monto, medio_pago)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            String(Date.now()),
            new Date(),
            descripcion || '',
            categoria || 'Insumos',
            toNumber(monto, 0),
            medioPago || 'Efectivo'
        ]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo guardar el gasto.' });
    }
});

app.delete('/api/gastos/:id', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM gastos WHERE id = $1', [String(req.params.id)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo eliminar el gasto.' });
    }
});

// FACTURAS
app.get('/api/facturas', requireAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM facturas ORDER BY fecha DESC, id DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar las facturas.' });
    }
});

app.post('/api/facturas', requireAdmin, upload.single('archivo'), async (req, res) => {
    try {
        const { proveedor, numFactura, montoNeto, fecha } = req.body;
        const neto = toNumber(montoNeto, 0);
        const iva = Math.round(neto * 0.19);
        const total = neto + iva;

        await pool.query(`
            INSERT INTO facturas (id, fecha, proveedor, num_factura, monto_neto, iva_recuperable, total, adjunto)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            String(Date.now()),
            fecha || fechaLocalInput(),
            proveedor || '',
            numFactura || '',
            neto,
            iva,
            total,
            req.file ? `/uploads/${req.file.filename}` : null
        ]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo guardar la factura.' });
    }
});

app.delete('/api/facturas/:id', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM facturas WHERE id = $1', [String(req.params.id)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo eliminar la factura.' });
    }
});

// DESPACHOS
app.get('/api/despachos', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM despachos ORDER BY fecha_creado DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar los despachos.' });
    }
});

app.post('/api/despachos', requireAuth, async (req, res) => {
    try {
        const { cliente, direccion, telefono, detalle, monto, estadoPago } = req.body;
        await pool.query(`
            INSERT INTO despachos (id, fecha_creado, cliente, direccion, telefono, detalle, monto, estado_pago, estado_entrega)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            String(Date.now()),
            new Date(),
            cliente || '',
            direccion || '',
            telefono || '',
            detalle || '',
            toNumber(monto, 0),
            estadoPago || 'Pendiente',
            'Pendiente'
        ]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo guardar el despacho.' });
    }
});

app.put('/api/despachos/:id/estado', requireAuth, async (req, res) => {
    try {
        const { estadoEntrega } = req.body;
        const result = await pool.query('UPDATE despachos SET estado_entrega = $1 WHERE id = $2', [estadoEntrega, String(req.params.id)]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo actualizar el despacho.' });
    }
});

app.delete('/api/despachos/:id', requireAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM despachos WHERE id = $1', [String(req.params.id)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo eliminar el despacho.' });
    }
});

function generarPDFCotizacion(items, cliente, observaciones) {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const subtotal = items.reduce((acc, item) => acc + (Number(item.precio || 0) * Number(item.cantidad || 0)), 0);
    const iva = subtotal * 0.19;
    const total = subtotal + iva;

    return {
        doc,
        subtotal,
        iva,
        total,
        cliente,
        observaciones
    };
}

app.post(['/api/cotizacion/pdf', '/api/cotización/pdf'], (req, res) => {
    try {
        const items = Array.isArray(req.body.items) ? req.body.items : [];
        const cliente = req.body.cliente || 'Cliente general';
        const observaciones = req.body.observaciones || 'Cotización emitida desde el sistema de gestión de vivero.';

        if (!items.length) {
            return res.status(400).json({ error: 'No hay ítems para generar una cotización.' });
        }

        const { doc, subtotal, iva, total } = generarPDFCotizacion(items, cliente, observaciones);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="cotizacion-${Date.now()}.pdf"`);
        doc.pipe(res);

        doc.fillColor('#1f5132').fontSize(22).text('Vivero Sol y Sombra', { align: 'left' });
        doc.fillColor('#4d7c0f').fontSize(12).text('Cotización / Presupuesto', { align: 'left' });
        doc.moveDown(0.8);

        doc.fillColor('#374151').fontSize(10).text(`Cliente: ${cliente}`);
        doc.text(`Fecha: ${archivoFecha()}`);
        doc.text(`Observaciones: ${observaciones}`);

        doc.moveDown(1);
        doc.fillColor('#dfeee4').rect(40, doc.y, 515, 24).fill();
        doc.fillColor('#183b2c').fontSize(10).text('ITEM', 50, doc.y + 7, { width: 210 });
        doc.text('CANT.', 260, doc.y + 7, { width: 60 });
        doc.text('P.UNIT.', 330, doc.y + 7, { width: 90 });
        doc.text('TOTAL', 430, doc.y + 7, { width: 110, align: 'right' });

        let currentY = doc.y + 30;
        items.forEach((item, index) => {
            const nombre = item.nombre || `Ítem ${index + 1}`;
            const cantidad = Number(item.cantidad || 0);
            const precio = Number(item.precio || 0);
            const subtotalItem = cantidad * precio;

            doc.fillColor('#111827').fontSize(10).text(nombre, 50, currentY, { width: 200 });
            doc.text(String(cantidad), 260, currentY, { width: 60 });
            doc.text(`$${formatearMonto(precio)}`, 330, currentY, { width: 90 });
            doc.text(`$${formatearMonto(subtotalItem)}`, 430, currentY, { width: 110, align: 'right' });
            currentY += 18;
        });

        const resumenY = currentY + 20;
        doc.moveTo(40, resumenY).lineTo(555, resumenY).strokeColor('#cbd5e1').stroke();

        doc.fillColor('#1f2937').fontSize(10);
        doc.text('Subtotal:', 360, resumenY + 15, { width: 90, align: 'right' });
        doc.text(`$${formatearMonto(subtotal)}`, 460, resumenY + 15, { width: 90, align: 'right' });
        doc.text('IVA (19%):', 360, resumenY + 32, { width: 90, align: 'right' });
        doc.text(`$${formatearMonto(iva)}`, 460, resumenY + 32, { width: 90, align: 'right' });
        doc.fillColor('#1b4332').fontSize(12).font('Helvetica-Bold');
        doc.text('TOTAL:', 360, resumenY + 52, { width: 90, align: 'right' });
        doc.text(`$${formatearMonto(total)}`, 460, resumenY + 52, { width: 90, align: 'right' });

        doc.font('Helvetica').fillColor('#475569').fontSize(9).text('Vivero Sol y Sombra • Productos y plantas ornamentales para jardín y exterior.', 40, 760, { align: 'center' });
        doc.end();
    } catch (error) {
        res.status(500).json({ error: 'No se pudo generar la cotización PDF.' });
    }
});

app.post(['/api/fichas/pdf', '/api/ficha/pdf'], async (req, res) => {
    try {
        const plantas = Array.isArray(req.body.plantas) && req.body.plantas.length ? req.body.plantas : (await pool.query('SELECT * FROM plantas ORDER BY nombre ASC')).rows;

        if (!plantas.length) {
            return res.status(400).json({ error: 'No hay plantas para generar fichas.' });
        }

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="fichas-cuidados-${Date.now()}.pdf"`);
        doc.pipe(res);

        doc.fillColor('#1f5132').fontSize(22).text('Vivero Sol y Sombra', { align: 'left' });
        doc.fillColor('#4d7c0f').fontSize(12).text('Ficha técnica de cuidados', { align: 'left' });
        doc.moveDown(0.7);
        doc.fillColor('#475569').fontSize(10).text(`Fecha de emisión: ${archivoFecha()}`);

        plantas.forEach((planta, index) => {
            if (index > 0) doc.addPage();

            const nombre = planta.nombre || 'Planta sin nombre';
            const cientifico = planta.cientifico || 'No registrado';
            const riego = planta.riego || 'Regar según humedad del sustrato, evitando encharcamientos.';
            const sol = planta.sol || planta.clima || 'Luz brillante indirecta o semi sombra.';
            const sustrato = planta.sustrato || 'Sustrato aireado, bien drenado y con materia orgánica.';
            const poda = planta.poda || 'Poda ligera para remover ramas secas y mantener forma.';
            const cuidados = planta.cuidados || 'Mantener condiciones estables, control de humedad y fertilización moderada.';

            doc.fillColor('#e8f5e9').rect(40, doc.y, 515, 110).fill();
            doc.fillColor('#1d4d3f').fontSize(18).font('Helvetica-Bold').text(nombre, 55, doc.y + 18, { width: 470 });
            doc.fillColor('#3f3f46').fontSize(10).font('Helvetica').text(`Nombre científico: ${cientifico}`, 55, doc.y + 47, { width: 470 });
            doc.text(`Categoría: ${planta.categoria || 'General'}`, 55, doc.y + 62, { width: 470 });
            doc.text(`Ubicación: ${planta.ubicacion || 'Vivero'}`, 55, doc.y + 77, { width: 470 });

            doc.moveDown(2.8);
            doc.fillColor('#1f2937');
            doc.list([
                `Riego: ${riego}`,
                `Sol: ${sol}`,
                `Sustrato: ${sustrato}`,
                `Poda: ${poda}`
            ], { bulletRadius: 2, indent: 12, columns: 1 });

            doc.moveDown(1);
            doc.fillColor('#f7f9ef').rect(40, doc.y, 515, 120).fill();
            doc.fillColor('#1f2937').fontSize(12).font('Helvetica-Bold').text('Cuidados recomendados', 55, doc.y + 12);
            doc.fillColor('#374151').fontSize(10).font('Helvetica').text(cuidados, 55, doc.y + 32, { width: 480, align: 'justify' });

            doc.moveDown(5);
        });

        doc.font('Helvetica').fillColor('#475569').fontSize(9).text('Fichas técnicas emitidas por Vivero Sol y Sombra.', 40, 760, { align: 'center' });
        doc.end();
    } catch (error) {
        res.status(500).json({ error: 'No se pudo generar la ficha de cuidados PDF.' });
    }
});

if (require.main === module) {
    startServer().catch((error) => {
        console.error('Error al iniciar el servidor:', error);
        process.exit(1);
    });
}

module.exports = { app, pool, initializeDatabase, startServer };
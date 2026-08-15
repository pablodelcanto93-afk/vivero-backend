const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: 'vivero_sol_y_sombra_secret_key_2026',
    resave: false,
    saveUninitialized: false
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

const PLANTAS_FILE = path.join(__dirname, 'plantas.json');
const VENTAS_FILE = path.join(__dirname, 'ventas.json');
const DESPACHOS_FILE = path.join(__dirname, 'despachos.json');
const GASTOS_FILE = path.join(__dirname, 'gastos.json');
const FACTURAS_FILE = path.join(__dirname, 'facturas.json');

function leerJSON(file) {
    if (!fs.existsSync(file)) return [];
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data || '[]');
    } catch (e) {
        return [];
    }
}

function guardarJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// LOGIN
app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    if (usuario === 'pdelcanto' && password === '1234') {
        req.session.user = { usuario: 'pdelcanto', rol: 'admin', nombre: 'Pablo Del Canto' };
        return res.json({ success: true, rol: 'admin' });
    } else if (usuario === 'vivero' && password === '1234') {
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
    req.session.destroy();
    res.redirect('/login.html');
});

function requireAuth(req, res, next) {
    if (req.session.user) next();
    else res.status(401).json({ error: 'No autorizado' });
}

function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.rol === 'admin') next();
    else res.status(403).json({ error: 'Acceso denegado' });
}

// PLANTAS
app.get('/api/plantas', (req, res) => {
    res.json(leerJSON(PLANTAS_FILE));
});

app.post('/api/plantas', requireAuth, upload.single('foto'), (req, res) => {
    const plantas = leerJSON(PLANTAS_FILE);
    const { id, nombre, cientifico, categoria, ubicacion, precio, stock, riego, clima, cuidados } = req.body;
    let fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (id) {
        const idx = plantas.findIndex(p => String(p.id) === String(id));
        if (idx !== -1) {
            plantas[idx] = {
                ...plantas[idx],
                nombre,
                cientifico: cientifico || '',
                categoria: categoria || '',
                ubicacion: ubicacion || '',
                precio: Number(precio),
                stock: Number(stock),
                riego: riego || '',
                clima: clima || '',
                cuidados: cuidados || '',
                foto: fotoUrl || plantas[idx].foto
            };
        }
    } else {
        plantas.push({
            id: Date.now().toString(),
            nombre,
            cientifico: cientifico || '',
            categoria: categoria || '',
            ubicacion: ubicacion || '',
            precio: Number(precio),
            stock: Number(stock),
            riego: riego || '',
            clima: clima || '',
            cuidados: cuidados || '',
            foto: fotoUrl || '/logo.png'
        });
    }

    guardarJSON(PLANTAS_FILE, plantas);
    res.json({ success: true });
});

app.delete('/api/plantas/:id', requireAuth, (req, res) => {
    let plantas = leerJSON(PLANTAS_FILE);
    plantas = plantas.filter(p => String(p.id) !== String(req.params.id));
    guardarJSON(PLANTAS_FILE, plantas);
    res.json({ success: true });
});

// VENTAS E HISTORIAL
app.get('/api/ventas', requireAdmin, (req, res) => {
    res.json(leerJSON(VENTAS_FILE));
});

app.post('/api/ventas', requireAuth, (req, res) => {
    const { items, medioPago } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Sin items' });

    const plantas = leerJSON(PLANTAS_FILE);
    const ventas = leerJSON(VENTAS_FILE);

    let totalVenta = 0;
    items.forEach(item => {
        const p = plantas.find(x => String(x.id) === String(item.id));
        if (p) {
            p.stock = Math.max(0, p.stock - item.cantidad);
            totalVenta += p.precio * item.cantidad;
        }
    });

    ventas.push({
        id: Date.now().toString(),
        fecha: new Date().toISOString(),
        vendedor: req.session.user ? req.session.user.usuario : 'Desconocido',
        medioPago: medioPago || 'Efectivo',
        items,
        total: totalVenta
    });

    guardarJSON(PLANTAS_FILE, plantas);
    guardarJSON(VENTAS_FILE, ventas);
    res.json({ success: true });
});

// REPORTES & CAJA
app.get('/api/reporte-admin', requireAdmin, (req, res) => {
    const plantas = leerJSON(PLANTAS_FILE);
    const ventas = leerJSON(VENTAS_FILE);
    const fechaFiltro = req.query.fecha;

    const valorTotalInventario = plantas.reduce((acc, p) => acc + (p.precio * p.stock), 0);
    const totalPlantasUnidades = plantas.reduce((acc, p) => acc + p.stock, 0);

    let ventasFiltradas = ventas;
    if (fechaFiltro) {
        ventasFiltradas = ventas.filter(v => v.fecha.startsWith(fechaFiltro));
    }

    let totalEfectivo = 0, totalTransferencia = 0, totalDebito = 0, totalRecaudadoVentas = 0;

    ventasFiltradas.forEach(v => {
        totalRecaudadoVentas += v.total;
        const medio = v.medioPago ? v.medioPago.toLowerCase() : 'efectivo';
        if (medio.includes('efectivo')) totalEfectivo += v.total;
        else if (medio.includes('transferencia')) totalTransferencia += v.total;
        else totalDebito += v.total;
    });

    res.json({
        valorTotalInventario,
        totalPlantasUnidades,
        totalRecaudadoVentas,
        caja: { efectivo: totalEfectivo, transferencia: totalTransferencia, debito: totalDebito },
        cantidadVentas: ventasFiltradas.length
    });
});

// GASTOS DE INSUMOS
app.get('/api/gastos', requireAdmin, (req, res) => {
    res.json(leerJSON(GASTOS_FILE));
});

app.post('/api/gastos', requireAdmin, (req, res) => {
    const gastos = leerJSON(GASTOS_FILE);
    const { descripcion, categoria, monto, medioPago } = req.body;

    gastos.push({
        id: Date.now().toString(),
        fecha: new Date().toISOString(),
        descripcion,
        categoria: categoria || 'Insumos',
        monto: Number(monto),
        medioPago: medioPago || 'Efectivo'
    });

    guardarJSON(GASTOS_FILE, gastos);
    res.json({ success: true });
});

app.delete('/api/gastos/:id', requireAdmin, (req, res) => {
    let gastos = leerJSON(GASTOS_FILE);
    gastos = gastos.filter(g => String(g.id) !== String(req.params.id));
    guardarJSON(GASTOS_FILE, gastos);
    res.json({ success: true });
});

// F29 Y FACTURAS DE COMPRA
app.get('/api/facturas', requireAdmin, (req, res) => {
    res.json(leerJSON(FACTURAS_FILE));
});

app.post('/api/facturas', requireAdmin, upload.single('archivo'), (req, res) => {
    const facturas = leerJSON(FACTURAS_FILE);
    const { proveedor, numFactura, montoNeto, fecha } = req.body;

    const neto = Number(montoNeto);
    const iva = Math.round(neto * 0.19);
    const total = neto + iva;

    facturas.push({
        id: Date.now().toString(),
        fecha: fecha || new Date().toISOString().split('T')[0],
        proveedor,
        numFactura,
        montoNeto: neto,
        ivaRecuperable: iva,
        total,
        adjunto: req.file ? `/uploads/${req.file.filename}` : null
    });

    guardarJSON(FACTURAS_FILE, facturas);
    res.json({ success: true });
});

app.delete('/api/facturas/:id', requireAdmin, (req, res) => {
    let facturas = leerJSON(FACTURAS_FILE);
    facturas = facturas.filter(f => String(f.id) !== String(req.params.id));
    guardarJSON(FACTURAS_FILE, facturas);
    res.json({ success: true });
});

// REPARTOS SÁBADO
app.get('/api/despachos', requireAuth, (req, res) => res.json(leerJSON(DESPACHOS_FILE)));

app.post('/api/despachos', requireAuth, (req, res) => {
    const despachos = leerJSON(DESPACHOS_FILE);
    const { cliente, direccion, telefono, detalle, monto, estadoPago } = req.body;

    despachos.push({
        id: Date.now().toString(),
        fechaCreado: new Date().toISOString(),
        cliente,
        direccion,
        telefono: telefono || '',
        detalle,
        monto: Number(monto || 0),
        estadoPago: estadoPago || 'Pendiente',
        estadoEntrega: 'Pendiente'
    });

    guardarJSON(DESPACHOS_FILE, despachos);
    res.json({ success: true });
});

app.put('/api/despachos/:id/estado', requireAuth, (req, res) => {
    const despachos = leerJSON(DESPACHOS_FILE);
    const idx = despachos.findIndex(d => String(d.id) === String(req.params.id));
    if (idx !== -1) {
        despachos[idx].estadoEntrega = req.body.estadoEntrega;
        guardarJSON(DESPACHOS_FILE, despachos);
        res.json({ success: true });
    } else res.status(404).json({ error: 'No encontrado' });
});

app.delete('/api/despachos/:id', requireAuth, (req, res) => {
    let despachos = leerJSON(DESPACHOS_FILE);
    despachos = despachos.filter(d => String(d.id) !== String(req.params.id));
    guardarJSON(DESPACHOS_FILE, despachos);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
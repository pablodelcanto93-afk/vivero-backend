const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CONEXIÓN A MONGO DB
const MONGO_URI = process.env.MONGO_URI || 'tu_uri_de_mongodb_aqui';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado a MongoDB Atlas'))
    .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// SCHEMAS / MODELOS DE MONGOOSE
const Planta = mongoose.model('Planta', new mongoose.Schema({
    nombre: String, cientifico: String, categoria: String, ubicacion: String,
    precio: Number, stock: Number, riego: String, clima: String, cuidados: String, foto: String
}));

const Venta = mongoose.model('Venta', new mongoose.Schema({
    fecha: { type: Date, default: Date.now },
    vendedor: String, medioPago: String, items: Array, total: Number
}));

const Despacho = mongoose.model('Despacho', new mongoose.Schema({
    fechaCreado: { type: Date, default: Date.now },
    cliente: String, direccion: String, telefono: String, detalle: String,
    monto: Number, estadoPago: String, estadoEntrega: { type: String, default: 'Pendiente' }
}));

const Gasto = mongoose.model('Gasto', new mongoose.Schema({
    fecha: { type: Date, default: Date.now },
    descripcion: String, categoria: String, monto: Number, medioPago: String
}));

const Factura = mongoose.model('Factura', new mongoose.Schema({
    fecha: String, proveedor: String, numFactura: String,
    montoNeto: Number, ivaRecuperable: Number, total: Number, adjunto: String
}));

// MIDDLEWARES
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'vivero_sol_y_sombra_secret_key_2026',
    resave: false,
    saveUninitialized: false
}));

// CONFIGURACIÓN DE UPLOADS CON MULTER
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// AUTH MIDDLEWARES
function requireAuth(req, res, next) {
    if (req.session.user) next();
    else res.status(401).json({ error: 'No autorizado' });
}

function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.rol === 'admin') next();
    else res.status(403).json({ error: 'Acceso denegado' });
}

// ENDPOINTS LOGIN
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
    res.json(req.session.user ? { loggedIn: true, user: req.session.user } : { loggedIn: false });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// ENDPOINTS PLANTAS
app.get('/api/plantas', async (req, res) => {
    const plantas = await Planta.find();
    res.json(plantas.map(p => ({ ...p._doc, id: p._id })));
});

app.post('/api/plantas', requireAuth, upload.single('foto'), async (req, res) => {
    const { id, nombre, cientifico, categoria, ubicacion, precio, stock, riego, clima, cuidados } = req.body;
    let fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const datosPlanta = {
        nombre, cientifico: cientifico || '', categoria: categoria || '',
        ubicacion: ubicacion || '', precio: Number(precio), stock: Number(stock),
        riego: riego || '', clima: clima || '', cuidados: cuidados || ''
    };
    if (fotoUrl) datosPlanta.foto = fotoUrl;

    if (id) {
        await Planta.findByIdAndUpdate(id, datosPlanta);
    } else {
        if (!datosPlanta.foto) datosPlanta.foto = '/logo.png';
        await Planta.create(datosPlanta);
    }
    res.json({ success: true });
});

app.delete('/api/plantas/:id', requireAuth, async (req, res) => {
    await Planta.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ENDPOINTS VENTAS (Con descuento automático de stock)
app.get('/api/ventas', requireAdmin, async (req, res) => {
    const ventas = await Venta.find();
    res.json(ventas);
});

app.post('/api/ventas', requireAuth, async (req, res) => {
    const { items, medioPago } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Sin items' });

    let totalVenta = 0;

    for (const item of items) {
        const p = await Planta.findById(item.id);
        if (p) {
            p.stock = Math.max(0, p.stock - Number(item.cantidad));
            await p.save();
            totalVenta += p.precio * Number(item.cantidad);
        }
    }

    await Venta.create({
        vendedor: req.session.user ? req.session.user.usuario : 'Desconocido',
        medioPago: medioPago || 'Efectivo',
        items,
        total: totalVenta
    });

    res.json({ success: true });
});

// ENDPOINTS REPORTES Y CAJA
app.get('/api/reporte-admin', requireAdmin, async (req, res) => {
    const plantas = await Planta.find();
    const ventas = await Venta.find();
    const fechaFiltro = req.query.fecha;

    const valorTotalInventario = plantas.reduce((acc, p) => acc + (p.precio * p.stock), 0);
    const totalPlantasUnidades = plantas.reduce((acc, p) => acc + p.stock, 0);

    let ventasFiltradas = ventas;
    if (fechaFiltro) {
        ventasFiltradas = ventas.filter(v => v.fecha.toISOString().startsWith(fechaFiltro));
    }

    let totalEfectivo = 0, totalTransferencia = 0, totalDebito = 0, totalRecaudadoVentas = 0;

    ventasFiltradas.forEach(v => {
        totalRecaudadoVentas += v.total;
        const medio = (v.medioPago || 'efectivo').toLowerCase();
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

// ENDPOINTS GASTOS
app.get('/api/gastos', requireAdmin, async (req, res) => {
    res.json(await Gasto.find());
});

app.post('/api/gastos', requireAdmin, async (req, res) => {
    const { descripcion, categoria, monto, medioPago } = req.body;
    await Gasto.create({
        descripcion, categoria: categoria || 'Insumos',
        monto: Number(monto), medioPago: medioPago || 'Efectivo'
    });
    res.json({ success: true });
});

app.delete('/api/gastos/:id', requireAdmin, async (req, res) => {
    await Gasto.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ENDPOINTS FACTURAS
app.get('/api/facturas', requireAdmin, async (req, res) => {
    res.json(await Factura.find());
});

app.post('/api/facturas', requireAdmin, upload.single('archivo'), async (req, res) => {
    const { proveedor, numFactura, montoNeto, fecha } = req.body;
    const neto = Number(montoNeto);
    const iva = Math.round(neto * 0.19);

    await Factura.create({
        fecha: fecha || new Date().toISOString().split('T')[0],
        proveedor, numFactura, montoNeto: neto,
        ivaRecuperable: iva, total: neto + iva,
        adjunto: req.file ? `/uploads/${req.file.filename}` : null
    });
    res.json({ success: true });
});

app.delete('/api/facturas/:id', requireAdmin, async (req, res) => {
    await Factura.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ENDPOINTS DESPACHOS
app.get('/api/despachos', requireAuth, async (req, res) => {
    const despachos = await Despacho.find();
    res.json(despachos.map(d => ({ ...d._doc, id: d._id })));
});

app.post('/api/despachos', requireAuth, async (req, res) => {
    const { cliente, direccion, telefono, detalle, monto, estadoPago } = req.body;
    await Despacho.create({
        cliente, direccion, telefono: telefono || '',
        detalle, monto: Number(monto || 0), estadoPago: estadoPago || 'Pendiente'
    });
    res.json({ success: true });
});

app.put('/api/despachos/:id/estado', requireAuth, async (req, res) => {
    await Despacho.findByIdAndUpdate(req.params.id, { estadoEntrega: req.body.estadoEntrega });
    res.json({ success: true });
});

app.delete('/api/despachos/:id', requireAuth, async (req, res) => {
    await Despacho.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
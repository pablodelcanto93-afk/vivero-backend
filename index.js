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

// LOGIN DE USUARIOS
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
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
}

// OBTENER PLANTAS
app.get('/api/plantas', (req, res) => {
    const plantas = leerJSON(PLANTAS_FILE);
    res.json(plantas);
});

// AGREGAR / EDITAR PLANTA
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
        const nuevaPlanta = {
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
        };
        plantas.push(nuevaPlanta);
    }

    guardarJSON(PLANTAS_FILE, plantas);
    res.json({ success: true });
});

// ELIMINAR PLANTA
app.delete('/api/plantas/:id', requireAuth, (req, res) => {
    let plantas = leerJSON(PLANTAS_FILE);
    plantas = plantas.filter(p => String(p.id) !== String(req.params.id));
    guardarJSON(PLANTAS_FILE, plantas);
    res.json({ success: true });
});

// REGISTRAR VENTA CON MEDIO DE PAGO
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

    const nuevaVenta = {
        id: Date.now().toString(),
        fecha: new Date().toISOString(),
        vendedor: req.session.user ? req.session.user.usuario : 'Desconocido',
        medioPago: medioPago || 'Efectivo',
        items,
        total: totalVenta
    };

    ventas.push(nuevaVenta);

    guardarJSON(PLANTAS_FILE, plantas);
    guardarJSON(VENTAS_FILE, ventas);

    res.json({ success: true });
});

// DASHBOARD DE CAJA Y REPORTES (SOLO ADMIN / PDELCANTO)
app.get('/api/reporte-admin', requireAuth, (req, res) => {
    if (req.session.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const plantas = leerJSON(PLANTAS_FILE);
    const ventas = leerJSON(VENTAS_FILE);

    const valorTotalInventario = plantas.reduce((acc, p) => acc + (p.precio * p.stock), 0);
    const totalPlantasUnidades = plantas.reduce((acc, p) => acc + p.stock, 0);
    const totalRecaudadoVentas = ventas.reduce((acc, v) => acc + v.total, 0);

    // Cierre de caja por medio de pago
    let totalEfectivo = 0;
    let totalTransferencia = 0;
    let totalDebito = 0;

    ventas.forEach(v => {
        const medio = v.medioPago ? v.medioPago.toLowerCase() : 'efectivo';
        if (medio.includes('efectivo')) totalEfectivo += v.total;
        else if (medio.includes('transferencia')) totalTransferencia += v.total;
        else if (medio.includes('débito') || medio.includes('debito') || medio.includes('tarjeta')) totalDebito += v.total;
        else totalEfectivo += v.total;
    });

    res.json({
        valorTotalInventario,
        totalPlantasUnidades,
        totalRecaudadoVentas,
        caja: {
            efectivo: totalEfectivo,
            transferencia: totalTransferencia,
            debito: totalDebito
        },
        ventas
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
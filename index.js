const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'vivero-sol-y-sombra-clave-secreta-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'planta-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });
const DATA_FILE = path.join(__dirname, 'plantas.json');

function obtenerPlantas() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
        return [];
    }
    try {
        const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(contenido || '[]');
    } catch (e) {
        return [];
    }
}

function guardarPlantas(plantas) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(plantas, null, 2), 'utf-8');
}

function requerirAutenticacion(req, res, next) {
    if (req.session && req.session.autenticado) {
        return next();
    }
    return res.status(401).json({ error: 'No autorizado', redirect: '/login.html' });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// --- RUTAS PÚBLICAS ---
app.get('/api/plantas/publico', (req, res) => {
    res.json(obtenerPlantas());
});

app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    if (usuario === "admin" && password === "vivero2026") {
        req.session.autenticado = true;
        return res.json({ status: 'ok', redirect: '/' });
    }
    return res.status(401).json({ status: 'error', mensaje: 'Usuario o clave incorrectos' });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// --- RUTAS PROTEGIDAS (ADMIN) ---
app.get('/api/plantas', requerirAutenticacion, (req, res) => {
    res.json(obtenerPlantas());
});

// Agregar o Actualizar Planta
app.post('/api/plantas', requerirAutenticacion, upload.single('foto'), (req, res) => {
    try {
        let plantas = obtenerPlantas();
        const idExistente = req.body.id;

        if (idExistente) {
            // Edición
            const index = plantas.findIndex(p => String(p.id) === String(idExistente));
            if (index !== -1) {
                plantas[index].nombre = req.body.nombre;
                plantas[index].cientifico = req.body.cientifico || '';
                plantas[index].categoria = req.body.categoria || '';
                plantas[index].ubicacion = req.body.ubicacion || '';
                plantas[index].precio = Number(req.body.precio) || 0;
                plantas[index].stock = Number(req.body.stock) || 0;
                if (req.file) {
                    plantas[index].foto = '/uploads/' + req.file.filename;
                }
            }
        } else {
            // Nueva Planta
            let fotoRuta = '/logo.png';
            if (req.file) fotoRuta = '/uploads/' + req.file.filename;

            const nuevaPlanta = {
                id: Date.now().toString(),
                nombre: req.body.nombre,
                cientifico: req.body.cientifico || '',
                categoria: req.body.categoria || '',
                ubicacion: req.body.ubicacion || '',
                precio: Number(req.body.precio) || 0,
                stock: Number(req.body.stock) || 0,
                foto: fotoRuta
            };
            plantas.push(nuevaPlanta);
        }

        guardarPlantas(plantas);
        res.status(200).json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: 'Error al procesar la planta' });
    }
});

app.post('/api/ventas', requerirAutenticacion, (req, res) => {
    try {
        const { items } = req.body;
        let plantas = obtenerPlantas();

        items.forEach(item => {
            const p = plantas.find(x => String(x.id) === String(item.id));
            if (p) {
                p.stock = Math.max(0, Number(p.stock) - Number(item.cantidad));
            }
        });

        guardarPlantas(plantas);
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: 'Error al procesar la venta' });
    }
});

app.delete('/api/plantas/:id', requerirAutenticacion, (req, res) => {
    try {
        let plantas = obtenerPlantas();
        const { id } = req.params;
        plantas = plantas.filter(p => String(p.id) !== String(id));
        guardarPlantas(plantas);
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar la planta' });
    }
});

app.listen(PORT, () => console.log(`Servidor iniciado en puerto ${PORT}`));
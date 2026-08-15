const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Sesiones
app.use(session({
    secret: 'vivero-sol-y-sombra-clave-secreta-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // La sesión dura 24 horas
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar multer para subida de fotos
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
        console.error("Error leyendo plantas.json:", e);
        return [];
    }
}

function guardarPlantas(plantas) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(plantas, null, 2), 'utf-8');
}

// Middleware para verificar si el usuario está autenticado
function requerirAutenticacion(req, res, next) {
    if (req.session && req.session.autenticado) {
        return next();
    }
    return res.redirect('/login.html');
}

// --- RUTAS PÚBLICAS ---

// El catálogo web sigue siendo accesible para todo el mundo
app.use('/catalogo.html', express.static(path.join(__dirname, 'public', 'catalogo.html')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/logo.png', express.static(path.join(__dirname, 'public', 'logo.png')));

// Ruta pública de la API para que el catálogo web pueda leer las plantas
app.get('/api/plantas/publico', (req, res) => {
    const plantas = obtenerPlantas();
    res.json(plantas);
});

// Procesar Inicio de Sesión (Usuario y Contraseña)
app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    
    // DEFINIR USUARIO Y CONTRASEÑA DE ACCESO
    const USUARIO_VALIDO = "admin";
    const PASSWORD_VALIDO = "vivero2026"; // Puedes cambiar esta clave si prefieres

    if (usuario === USUARIO_VALIDO && password === PASSWORD_VALIDO) {
        req.session.autenticado = true;
        return res.json({ status: 'ok', redirect: '/' });
    } else {
        return res.status(401).json({ status: 'error', mensaje: 'Usuario o contraseña incorrectos' });
    }
});

// Cerrar sesión
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// --- RUTAS PROTEGIDAS (Solo accesibles tras iniciar sesión) ---

// Proteger la página principal (index.html / inventario)
app.get('/', requerirAutenticacion, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', requerirAutenticacion, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Archivos estáticos protegidos
app.use(express.static(path.join(__dirname, 'public')));

// API protegida para modificar/ver inventario administrativo
app.get('/api/plantas', requerirAutenticacion, (req, res) => {
    const plantas = obtenerPlantas();
    res.json(plantas);
});

app.post('/api/plantas', requerirAutenticacion, upload.single('foto'), (req, res) => {
    try {
        const plantas = obtenerPlantas();
        let fotoRuta = '/logo.png';

        if (req.file) {
            fotoRuta = '/uploads/' + req.file.filename;
        } else if (req.body.fotoUrl) {
            fotoRuta = req.body.fotoUrl;
        }

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
        guardarPlantas(plantas);

        res.status(201).json({ status: 'ok', planta: nuevaPlanta });
    } catch (err) {
        console.error("Error al guardar planta:", err);
        res.status(500).json({ error: 'Error al guardar la planta' });
    }
});

app.delete('/api/plantas/:id', requerirAutenticacion, (req, res) => {
    try {
        let plantas = obtenerPlantas();
        const { id } = req.params;
        plantas = plantas.filter(p => p.id !== id && p._id !== id);
        guardarPlantas(plantas);
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar la planta' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'plantas.json');

// Función auxiliar para leer las plantas desde plantas.json
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

// Función auxiliar para guardar plantas
function guardarPlantas(plantas) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(plantas, null, 2), 'utf-8');
}

// RUTA GET: Obtener todas las plantas (esto es lo que alimenta la tabla)
app.get('/api/plantas', (req, res) => {
    const plantas = obtenerPlantas();
    res.json(plantas);
});

// RUTA POST: Agregar nueva planta (con foto)
app.post('/api/plantas', upload.single('foto'), (req, res) => {
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

// RUTA DELETE: Eliminar planta
app.delete('/api/plantas/:id', (req, res) => {
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
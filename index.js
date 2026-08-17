const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar guardado de imágenes
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Archivo de datos JSON
const JSON_FILE = path.join(__dirname, 'plantas.json');

function leerPlantas() {
    try {
        if (!fs.existsSync(JSON_FILE)) return [];
        const data = fs.readFileSync(JSON_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (e) {
        return [];
    }
}

function guardarPlantas(plantas) {
    fs.writeFileSync(JSON_FILE, JSON.stringify(plantas, null, 2));
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// RUTAS API
app.get('/api/plantas', (req, res) => {
    res.json(leerPlantas());
});

app.post('/api/plantas', upload.single('foto'), (req, res) => {
    try {
        const plantas = leerPlantas();
        const nuevaPlanta = {
            id: Date.now(),
            nombre: req.body.nombre,
            cientifico: req.body.cientifico || '',
            categoria: req.body.categoria || 'General',
            precio: Number(req.body.precio) || 0,
            stock: Number(req.body.stock) || 0,
            ubicacion: req.body.ubicacion || '',
            foto: req.file ? `/uploads/${req.file.filename}` : '/logo.png'
        };

        plantas.push(nuevaPlanta);
        guardarPlantas(plantas);
        res.json({ success: true, planta: nuevaPlanta });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/plantas/:id', (req, res) => {
    let plantas = leerPlantas();
    plantas = plantas.filter(p => p.id != req.params.id);
    guardarPlantas(plantas);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
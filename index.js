const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// CLAVE DE SEGURIDAD (Puedes cambiar '1234' por la clave que quieras)
const CLAVE_ADMIN = '1234';

app.use(express.static('public'));

// Configuración para subir imágenes de plantas
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Archivos JSON de base de datos
const DATA_FILE = path.join(__dirname, 'plantas.json');
const VENTAS_FILE = path.join(__dirname, 'ventas.json');

function obtenerPlantas() {
  if (!fs.existsSync(DATA_FILE)) {
    const iniciales = [
      { id: 11, nombre: "Níspero", nombre_cientifico: "Nispero", categoria: "Frutal", ubicacion: "Nave sombra", precio: 5000, stock: 6 },
      { id: 12, nombre: "Olivos", nombre_cientifico: "", categoria: "Frutal", ubicacion: "Nave sombra", precio: 15000, stock: 3 },
      { id: 13, nombre: "Aloe vera", nombre_cientifico: "", categoria: "", ubicacion: "nave sombra", precio: 5000, stock: 6 },
      { id: 14, nombre: "Stenocarpus rojo M", nombre_cientifico: "", categoria: "Cierre", ubicacion: "nave sombra", precio: 1000, stock: 20 }
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(iniciales, null, 2));
    return iniciales;
  }
  const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(contenido || '[]');
}

function guardarPlantas(plantas) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(plantas, null, 2));
}

function obtenerVentas() {
  if (!fs.existsSync(VENTAS_FILE)) {
    fs.writeFileSync(VENTAS_FILE, JSON.stringify([], null, 2));
    return [];
  }
  const contenido = fs.readFileSync(VENTAS_FILE, 'utf-8');
  return JSON.parse(contenido || '[]');
}

function guardarVenta(venta) {
  const ventas = obtenerVentas();
  ventas.unshift(venta); // Agregar al principio
  fs.writeFileSync(VENTAS_FILE, JSON.stringify(ventas, null, 2));
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- RUTAS DE LA API ---

// Validar clave desde el frontend
app.post('/api/login', (req, res) => {
  const { pin } = req.body;
  if (pin === CLAVE_ADMIN) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Clave incorrecta" });
  }
});

// 1. Obtener todas las plantas
const GET_PLANTAS_HANDLER = (req, res) => {
  res.json(obtenerPlantas());
};
app.get('/api/plantas', GET_PLANTAS_HANDLER);
app.get('/plantas', GET_PLANTAS_HANDLER);
app.get('/api/inventario', GET_PLANTAS_HANDLER);

// 2. Obtener Historial de Ventas
app.get('/api/ventas', (req, res) => {
  res.json(obtenerVentas());
});

// 3. Agregar nueva planta
const POST_PLANTA_HANDLER = (req, res) => {
  const plantas = obtenerPlantas();
  const { nombre, nombre_cientifico, categoria, ubicacion, precio, stock } = req.body;

  const nuevaPlanta = {
    id: plantas.length > 0 ? Math.max(...plantas.map(p => p.id)) + 1 : 1,
    nombre: nombre || 'Sin nombre',
    nombre_cientifico: nombre_cientifico || '',
    categoria: categoria || '',
    ubicacion: ubicacion || '',
    precio: Number(precio) || 0,
    stock: Number(stock) || 0,
    foto: req.file ? `/uploads/${req.file.filename}` : null
  };

  plantas.push(nuevaPlanta);
  guardarPlantas(plantas);
  res.status(201).json(nuevaPlanta);
};
app.post('/api/plantas', upload.single('foto'), POST_PLANTA_HANDLER);
app.post('/plantas', upload.single('foto'), POST_PLANTA_HANDLER);

// 4. Editar planta
const PUT_PLANTA_HANDLER = (req, res) => {
  const id = Number(req.params.id);
  let plantas = obtenerPlantas();
  const index = plantas.findIndex(p => p.id === id);

  if (index !== -1) {
    const { nombre, nombre_cientifico, categoria, ubicacion, precio, stock } = req.body;
    
    plantas[index] = {
      ...plantas[index],
      nombre: nombre || plantas[index].nombre,
      nombre_cientifico: nombre_cientifico !== undefined ? nombre_cientifico : plantas[index].nombre_cientifico,
      categoria: categoria !== undefined ? categoria : plantas[index].categoria,
      ubicacion: ubicacion !== undefined ? ubicacion : plantas[index].ubicacion,
      precio: precio !== undefined ? Number(precio) : plantas[index].precio,
      stock: stock !== undefined ? Number(stock) : plantas[index].stock,
      foto: req.file ? `/uploads/${req.file.filename}` : plantas[index].foto
    };

    guardarPlantas(plantas);
    res.json(plantas[index]);
  } else {
    res.status(404).json({ error: "Planta no encontrada" });
  }
};
app.put('/api/plantas/:id', upload.single('foto'), PUT_PLANTA_HANDLER);
app.post('/api/plantas/:id/edit', upload.single('foto'), PUT_PLANTA_HANDLER);

// 5. Eliminar planta
const DELETE_PLANTA_HANDLER = (req, res) => {
  const id = Number(req.params.id);
  let plantas = obtenerPlantas();
  const nuevasPlantas = plantas.filter(p => p.id !== id);

  if (plantas.length !== nuevasPlantas.length) {
    guardarPlantas(nuevasPlantas);
    res.json({ success: true, message: "Planta eliminada" });
  } else {
    res.status(404).json({ error: "Planta no encontrada" });
  }
};
app.delete('/api/plantas/:id', DELETE_PLANTA_HANDLER);
app.post('/api/plantas/:id/delete', DELETE_PLANTA_HANDLER);

// 6. Registrar Venta (-1 unidad + Registro Histórico)
const VENTA_HANDLER = (req, res) => {
  const id = Number(req.params.id);
  let plantas = obtenerPlantas();
  const index = plantas.findIndex(p => p.id === id);

  if (index !== -1) {
    if (plantas[index].stock > 0) {
      plantas[index].stock -= 1;
      guardarPlantas(plantas);

      // Guardar en el historial de ventas
      const fechaActual = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
      guardarVenta({
        idVenta: Date.now(),
        plantaId: plantas[index].id,
        nombre: plantas[index].nombre,
        precio: plantas[index].precio,
        fecha: fechaActual
      });
    }
    res.json(plantas[index]);
  } else {
    res.status(404).json({ error: "Planta no encontrada" });
  }
};
app.post('/api/plantas/:id/venta', VENTA_HANDLER);
app.post('/plantas/:id/venta', VENTA_HANDLER);

// Iniciar Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Vivero Sol y Sombra activo en http://localhost:${PORT}`);
});
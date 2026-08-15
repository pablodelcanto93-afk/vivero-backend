const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Base de datos temporal en memoria
let plantas = [];
let ventas = [];
const PIN_ADMIN = "1234"; // Puedes cambiar este PIN por el que tú quieras

// --- RUTAS DE LA API ---

// Login para ingresar al sistema administrativo
app.post('/api/login', (req, res) => {
  const { pin } = req.body;
  if (pin == PIN_ADMIN || pin == (process.env.PIN_ADMIN || "1234")) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Clave incorrecta" });
});

// Ruta PÚBLICA para el catálogo (sin contraseña)
app.get('/api/catalogo-publico', (req, res) => {
  res.json(plantas);
});

// Obtener inventario (Sistema privado)
app.get('/api/plantas', (req, res) => {
  res.json(plantas);
});

// Agregar nueva planta
app.post('/api/plantas', (req, res) => {
  const nuevaPlanta = {
    id: Date.now(),
    nombre: req.body.nombre || 'Planta sin nombre',
    nombre_cientifico: req.body.nombre_cientifico || '',
    categoria: req.body.categoria || '',
    ubicacion: req.body.ubicacion || '',
    precio: Number(req.body.precio) || 0,
    stock: Number(req.body.stock) || 0,
    foto: req.body.foto || ''
  };
  plantas.push(nuevaPlanta);
  res.json({ ok: true, planta: nuevaPlanta });
});

// Editar planta existente
app.put('/api/plantas/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = plantas.findIndex(p => p.id === id);
  if (index !== -1) {
    plantas[index] = { ...plantas[index], ...req.body };
    return res.json({ ok: true });
  }
  res.status(404).json({ error: "Planta no encontrada" });
});

// Eliminar planta
app.delete('/api/plantas/:id', (req, res) => {
  const id = Number(req.params.id);
  plantas = plantas.filter(p => p.id !== id);
  res.json({ ok: true });
});

// Consultar historial de ventas
app.get('/api/ventas', (req, res) => {
  res.json(ventas);
});

// Registrar una venta y descontar del inventario
app.post('/api/plantas/:id/venta', (req, res) => {
  const id = Number(req.params.id);
  const planta = plantas.find(p => p.id === id);

  if (planta && planta.stock > 0) {
    planta.stock--;
    const ahora = new Date();
    const dia = String(ahora.getDate()).padStart(2, '0');
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const anio = ahora.getFullYear();
    const fechaFormateada = `${dia}-${mes}-${anio}`;
    
    ventas.push({
      fecha: fechaFormateada,
      plantaId: planta.id,
      nombre: planta.nombre,
      precio: planta.precio
    });
    return res.json({ ok: true });
  }
  res.status(400).json({ error: "Sin stock suficiente o planta no encontrada" });
});

app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
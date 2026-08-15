const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Configurar límite de tamaño para permitir subir imágenes en Base64 desde el celular
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Base de datos temporal en memoria
let plantas = [];
let ventas = [];
const PIN_ADMIN = process.env.PIN_ADMIN || "1234"; // Clave de acceso

// --- RUTAS DE LA API ---

// Login para ingresar al sistema administrativo
app.post('/api/login', (req, res) => {
    const { pin } = req.body;
    if (pin == PIN_ADMIN) {
        return res.json({ ok: true });
    }
    return res.status(401).json({ error: "Clave incorrecta." });
});

// Ruta PÚBLICA para el catálogo (sin contraseña)
app.get('/api/catalogo-publico', (req, res) => {
    res.json(plantas);
});

// Obtener inventario (Sistema privado)
app.get('/api/plantas', (req, res) => {
    res.json(plantas);
});

// Registrar o actualizar una planta (Soporta foto en Base64 o URL)
app.post('/api/plantas', (req, res) => {
    const nuevaPlanta = req.body;
    
    // Si la planta ya existe, actualizamos sus datos
    const index = plantas.findIndex(p => p.id === nuevaPlanta.id);
    if (index !== -1) {
        plantas[index] = { ...plantas[index], ...nuevaPlanta };
    } else {
        // Nueva planta
        nuevaPlanta.id = Date.now().toString();
        plantas.push(nuevaPlanta);
    }
    
    res.json({ ok: true, plantas });
});

// Eliminar una planta
app.delete('/api/plantas/:id', (req, res) => {
    const { id } = req.params;
    plantas = plantas.filter(p => p.id !== id);
    res.json({ ok: true, plantas });
});

// Registrar una venta
app.post('/api/ventas', (req, res) => {
    const { items, total } = req.body;
    
    // Descontar stock
    items.forEach(item => {
        const planta = plantas.find(p => p.id === item.id);
        if (planta) {
            planta.stock = Math.max(0, parseInt(planta.stock) - parseInt(item.cantidad));
        }
    });

    const nuevaVenta = {
        id: Date.now().toString(),
        fecha: new Date().toISOString(),
        items,
        total
    };

    ventas.push(nuevaVenta);
    res.json({ ok: true, ventas, plantas });
});

// Obtener historial de ventas
app.get('/api/ventas', (req, res) => {
    res.json(ventas);
});

// Redireccionar cualquier otra ruta a la página principal
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
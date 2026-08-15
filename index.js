const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para procesar JSON y archivos estáticos de la carpeta public
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Ruta Principal (Dominio directo -> Muestra el Catálogo Público)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'catalogo.html'));
});

// 2. Ruta para tu Sistema Privado / Inventario y POS
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. Catálogo público accesible libremente (sin clave)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'catalogo.html'));
});

// Serve los archivos estáticos de public
app.use(express.static(path.join(__dirname, 'public')));

// 2. Panel de administración privado
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
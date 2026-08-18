const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(session({
    secret: 'vivero_sol_y_sombra_secret_key_2026',
    resave: false,
    saveUninitialized: false
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(UPLOADS_DIR)) {
            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        }
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

const PLANTAS_FILE = path.join(DATA_DIR, 'plantas.json');
const VENTAS_FILE = path.join(DATA_DIR, 'ventas.json');
const DESPACHOS_FILE = path.join(DATA_DIR, 'despachos.json');
const GASTOS_FILE = path.join(DATA_DIR, 'gastos.json');
const FACTURAS_FILE = path.join(DATA_DIR, 'facturas.json');

function asegurarArchivoJSON(file, valorInicial = []) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(valorInicial, null, 2), 'utf8');
        return valorInicial;
    }

    const contenido = fs.readFileSync(file, 'utf8').trim();
    if (!contenido) {
        fs.writeFileSync(file, JSON.stringify(valorInicial, null, 2), 'utf8');
        return valorInicial;
    }

    try {
        const parsed = JSON.parse(contenido);
        return Array.isArray(parsed) ? parsed : valorInicial;
    } catch (error) {
        return valorInicial;
    }
}

function leerJSON(file) {
    return asegurarArchivoJSON(file, []);
}

function guardarJSON(file, data) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const tempFile = `${file}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, file);
}

function fechaLocalISO(date = new Date()) {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString();
}

function fechaLocalInput(date = new Date()) {
    const d = new Date(date);
    const pad = (valor) => String(valor).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalizarFechaLocal(fecha) {
    if (!fecha) return '';
    const texto = String(fecha);
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

    const date = new Date(texto);
    if (Number.isNaN(date.getTime())) return texto.slice(0, 10);

    const pad = (valor) => String(valor).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function archivoFecha() {
    return new Date().toLocaleDateString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function formatearMonto(valor) {
    return Number(valor || 0).toLocaleString('es-CL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

// LOGIN
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
    if (req.session.user) next();
    else res.status(401).json({ error: 'No autorizado' });
}

function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.rol === 'admin') next();
    else res.status(403).json({ error: 'Acceso denegado' });
}

// PLANTAS
app.get('/api/plantas', (req, res) => {
    res.json(leerJSON(PLANTAS_FILE));
});

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
        plantas.push({
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
        });
    }

    guardarJSON(PLANTAS_FILE, plantas);
    res.json({ success: true });
});

app.delete('/api/plantas/:id', requireAuth, (req, res) => {
    let plantas = leerJSON(PLANTAS_FILE);
    plantas = plantas.filter(p => String(p.id) !== String(req.params.id));
    guardarJSON(PLANTAS_FILE, plantas);
    res.json({ success: true });
});

// VENTAS E HISTORIAL
app.get('/api/ventas', requireAdmin, (req, res) => {
    res.json(leerJSON(VENTAS_FILE));
});

app.post('/api/ventas', requireAuth, (req, res) => {
    const { items, medioPago } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Sin items' });

    const plantas = leerJSON(PLANTAS_FILE);
    const ventas = leerJSON(VENTAS_FILE);

    let totalVenta = 0;
    items.forEach(item => {
        const p = plantas.find(x => String(x.id) === String(item.id));
        if (p) {
            p.stock = Math.max(0, Number(p.stock) - Number(item.cantidad));
            totalVenta += Number(p.precio) * Number(item.cantidad);
        }
    });

    ventas.push({
        id: Date.now().toString(),
        fecha: fechaLocalISO(),
        vendedor: req.session.user ? req.session.user.usuario : 'Desconocido',
        medioPago: medioPago || 'Efectivo',
        items,
        total: totalVenta
    });

    guardarJSON(PLANTAS_FILE, plantas);
    guardarJSON(VENTAS_FILE, ventas);
    res.json({ success: true });
});

// REPORTES & CAJA
app.get('/api/reporte-admin', requireAdmin, (req, res) => {
    const plantas = leerJSON(PLANTAS_FILE);
    const ventas = leerJSON(VENTAS_FILE);
    const fechaFiltro = req.query.fecha;

    const valorTotalInventario = plantas.reduce((acc, p) => acc + (p.precio * p.stock), 0);
    const totalPlantasUnidades = plantas.reduce((acc, p) => acc + p.stock, 0);

    let ventasFiltradas = ventas;
    if (fechaFiltro) {
        const fechaFiltroLocal = String(fechaFiltro).slice(0, 10);
        ventasFiltradas = ventas.filter(v => {
            if (!v.fecha) return false;
            const fechaVenta = normalizarFechaLocal(v.fecha);
            return fechaVenta.startsWith(fechaFiltroLocal);
        });
    }

    let totalEfectivo = 0, totalTransferencia = 0, totalDebito = 0, totalRecaudadoVentas = 0;

    ventasFiltradas.forEach(v => {
        totalRecaudadoVentas += v.total;
        const medio = v.medioPago ? v.medioPago.toLowerCase() : 'efectivo';
        if (medio.includes('efectivo')) totalEfectivo += v.total;
        else if (medio.includes('transferencia')) totalTransferencia += v.total;
        else totalDebito += v.total;
    });

    res.json({
        valorTotalInventario,
        totalPlantasUnidades,
        totalRecaudadoVentas,
        caja: { efectivo: totalEfectivo, transferencia: totalTransferencia, debito: totalDebito },
        cantidadVentas: ventasFiltradas.length
    });
});

// GASTOS DE INSUMOS
app.get('/api/gastos', requireAdmin, (req, res) => {
    res.json(leerJSON(GASTOS_FILE));
});

app.post('/api/gastos', requireAdmin, (req, res) => {
    const gastos = leerJSON(GASTOS_FILE);
    const { descripcion, categoria, monto, medioPago } = req.body;

    gastos.push({
        id: Date.now().toString(),
        fecha: fechaLocalISO(),
        descripcion,
        categoria: categoria || 'Insumos',
        monto: Number(monto),
        medioPago: medioPago || 'Efectivo'
    });

    guardarJSON(GASTOS_FILE, gastos);
    res.json({ success: true });
});

app.delete('/api/gastos/:id', requireAdmin, (req, res) => {
    let gastos = leerJSON(GASTOS_FILE);
    gastos = gastos.filter(g => String(g.id) !== String(req.params.id));
    guardarJSON(GASTOS_FILE, gastos);
    res.json({ success: true });
});

// F29 Y FACTURAS DE COMPRA
app.get('/api/facturas', requireAdmin, (req, res) => {
    res.json(leerJSON(FACTURAS_FILE));
});

app.post('/api/facturas', requireAdmin, upload.single('archivo'), (req, res) => {
    const facturas = leerJSON(FACTURAS_FILE);
    const { proveedor, numFactura, montoNeto, fecha } = req.body;

    const neto = Number(montoNeto);
    const iva = Math.round(neto * 0.19);
    const total = neto + iva;

    facturas.push({
        id: Date.now().toString(),
        fecha: fecha || fechaLocalInput(),
        proveedor,
        numFactura,
        montoNeto: neto,
        ivaRecuperable: iva,
        total,
        adjunto: req.file ? `/uploads/${req.file.filename}` : null
    });

    guardarJSON(FACTURAS_FILE, facturas);
    res.json({ success: true });
});

app.delete('/api/facturas/:id', requireAdmin, (req, res) => {
    let facturas = leerJSON(FACTURAS_FILE);
    facturas = facturas.filter(f => String(f.id) !== String(req.params.id));
    guardarJSON(FACTURAS_FILE, facturas);
    res.json({ success: true });
});

// REPARTOS SÁBADO
app.get('/api/despachos', requireAuth, (req, res) => res.json(leerJSON(DESPACHOS_FILE)));

app.post('/api/despachos', requireAuth, (req, res) => {
    const despachos = leerJSON(DESPACHOS_FILE);
    const { cliente, direccion, telefono, detalle, monto, estadoPago } = req.body;

    despachos.push({
        id: Date.now().toString(),
        fechaCreado: fechaLocalISO(),
        cliente,
        direccion,
        telefono: telefono || '',
        detalle,
        monto: Number(monto || 0),
        estadoPago: estadoPago || 'Pendiente',
        estadoEntrega: 'Pendiente'
    });

    guardarJSON(DESPACHOS_FILE, despachos);
    res.json({ success: true });
});

app.put('/api/despachos/:id/estado', requireAuth, (req, res) => {
    const despachos = leerJSON(DESPACHOS_FILE);
    const idx = despachos.findIndex(d => String(d.id) === String(req.params.id));
    if (idx !== -1) {
        despachos[idx].estadoEntrega = req.body.estadoEntrega;
        guardarJSON(DESPACHOS_FILE, despachos);
        res.json({ success: true });
    } else res.status(404).json({ error: 'No encontrado' });
});

app.delete('/api/despachos/:id', requireAuth, (req, res) => {
    let despachos = leerJSON(DESPACHOS_FILE);
    despachos = despachos.filter(d => String(d.id) !== String(req.params.id));
    guardarJSON(DESPACHOS_FILE, despachos);
    res.json({ success: true });
});

function generarPDFCotizacion(items, cliente, observaciones) {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const subtotal = items.reduce((acc, item) => acc + (Number(item.precio || 0) * Number(item.cantidad || 0)), 0);
    const iva = subtotal * 0.19;
    const total = subtotal + iva;

    return {
        doc,
        subtotal,
        iva,
        total,
        cliente,
        observaciones
    };
}

app.post(['/api/cotizacion/pdf', '/api/cotización/pdf'], (req, res) => {
    try {
        const items = Array.isArray(req.body.items) ? req.body.items : [];
        const cliente = req.body.cliente || 'Cliente general';
        const observaciones = req.body.observaciones || 'Cotización emitida desde el sistema de gestión de vivero.';

        if (!items.length) {
            return res.status(400).json({ error: 'No hay ítems para generar una cotización.' });
        }

        const { doc, subtotal, iva, total } = generarPDFCotizacion(items, cliente, observaciones);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="cotizacion-${Date.now()}.pdf"`);
        doc.pipe(res);

        doc.fillColor('#1f5132').fontSize(22).text('Vivero Sol y Sombra', { align: 'left' });
        doc.fillColor('#4d7c0f').fontSize(12).text('Cotización / Presupuesto', { align: 'left' });
        doc.moveDown(0.8);

        doc.fillColor('#374151').fontSize(10).text(`Cliente: ${cliente}`);
        doc.text(`Fecha: ${archivoFecha()}`);
        doc.text(`Observaciones: ${observaciones}`);

        doc.moveDown(1);
        doc.fillColor('#dfeee4').rect(40, doc.y, 515, 24).fill();
        doc.fillColor('#183b2c').fontSize(10).text('ITEM', 50, doc.y + 7, { width: 210 });
        doc.text('CANT.', 260, doc.y + 7, { width: 60 });
        doc.text('P.UNIT.', 330, doc.y + 7, { width: 90 });
        doc.text('TOTAL', 430, doc.y + 7, { width: 110, align: 'right' });

        let currentY = doc.y + 30;
        items.forEach((item, index) => {
            const nombre = item.nombre || `Ítem ${index + 1}`;
            const cantidad = Number(item.cantidad || 0);
            const precio = Number(item.precio || 0);
            const subtotalItem = cantidad * precio;

            doc.fillColor('#111827').fontSize(10).text(nombre, 50, currentY, { width: 200 });
            doc.text(String(cantidad), 260, currentY, { width: 60 });
            doc.text(`$${formatearMonto(precio)}`, 330, currentY, { width: 90 });
            doc.text(`$${formatearMonto(subtotalItem)}`, 430, currentY, { width: 110, align: 'right' });
            currentY += 18;
        });

        const resumenY = currentY + 20;
        doc.moveTo(40, resumenY).lineTo(555, resumenY).strokeColor('#cbd5e1').stroke();

        doc.fillColor('#1f2937').fontSize(10);
        doc.text('Subtotal:', 360, resumenY + 15, { width: 90, align: 'right' });
        doc.text(`$${formatearMonto(subtotal)}`, 460, resumenY + 15, { width: 90, align: 'right' });
        doc.text('IVA (19%):', 360, resumenY + 32, { width: 90, align: 'right' });
        doc.text(`$${formatearMonto(iva)}`, 460, resumenY + 32, { width: 90, align: 'right' });
        doc.fillColor('#1b4332').fontSize(12).font('Helvetica-Bold');
        doc.text('TOTAL:', 360, resumenY + 52, { width: 90, align: 'right' });
        doc.text(`$${formatearMonto(total)}`, 460, resumenY + 52, { width: 90, align: 'right' });

        doc.font('Helvetica').fillColor('#475569').fontSize(9).text('Vivero Sol y Sombra • Productos y plantas ornamentales para jardín y exterior.', 40, 760, { align: 'center' });
        doc.end();
    } catch (error) {
        res.status(500).json({ error: 'No se pudo generar la cotización PDF.' });
    }
});

app.post(['/api/fichas/pdf', '/api/ficha/pdf'], (req, res) => {
    try {
        const plantas = Array.isArray(req.body.plantas) && req.body.plantas.length ? req.body.plantas : leerJSON(PLANTAS_FILE);

        if (!plantas.length) {
            return res.status(400).json({ error: 'No hay plantas para generar fichas.' });
        }

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="fichas-cuidados-${Date.now()}.pdf"`);
        doc.pipe(res);

        doc.fillColor('#1f5132').fontSize(22).text('Vivero Sol y Sombra', { align: 'left' });
        doc.fillColor('#4d7c0f').fontSize(12).text('Ficha técnica de cuidados', { align: 'left' });
        doc.moveDown(0.7);
        doc.fillColor('#475569').fontSize(10).text(`Fecha de emisión: ${archivoFecha()}`);

        plantas.forEach((planta, index) => {
            if (index > 0) doc.addPage();

            const nombre = planta.nombre || 'Planta sin nombre';
            const cientifico = planta.cientifico || 'No registrado';
            const riego = planta.riego || 'Regar según humedad del sustrato, evitando encharcamientos.';
            const sol = planta.sol || planta.clima || 'Luz brillante indirecta o semi sombra.';
            const sustrato = planta.sustrato || 'Sustrato aireado, bien drenado y con materia orgánica.';
            const poda = planta.poda || 'Poda ligera para remover ramas secas y mantener forma.';
            const cuidados = planta.cuidados || 'Mantener condiciones estables, control de humedad y fertilización moderada.';

            doc.fillColor('#e8f5e9').rect(40, doc.y, 515, 110).fill();
            doc.fillColor('#1d4d3f').fontSize(18).font('Helvetica-Bold').text(nombre, 55, doc.y + 18, { width: 470 });
            doc.fillColor('#3f3f46').fontSize(10).font('Helvetica').text(`Nombre científico: ${cientifico}`, 55, doc.y + 47, { width: 470 });
            doc.text(`Categoría: ${planta.categoria || 'General'}`, 55, doc.y + 62, { width: 470 });
            doc.text(`Ubicación: ${planta.ubicacion || 'Vivero'}`, 55, doc.y + 77, { width: 470 });

            doc.moveDown(2.8);
            doc.fillColor('#1f2937');
            doc.list([
                `Riego: ${riego}`,
                `Sol: ${sol}`,
                `Sustrato: ${sustrato}`,
                `Poda: ${poda}`
            ], { bulletRadius: 2, indent: 12, columns: 1 });

            doc.moveDown(1);
            doc.fillColor('#f7f9ef').rect(40, doc.y, 515, 120).fill();
            doc.fillColor('#1f2937').fontSize(12).font('Helvetica-Bold').text('Cuidados recomendados', 55, doc.y + 12);
            doc.fillColor('#374151').fontSize(10).font('Helvetica').text(cuidados, 55, doc.y + 32, { width: 480, align: 'justify' });

            doc.moveDown(5);
        });

        doc.font('Helvetica').fillColor('#475569').fontSize(9).text('Fichas técnicas emitidas por Vivero Sol y Sombra.', 40, 760, { align: 'center' });
        doc.end();
    } catch (error) {
        res.status(500).json({ error: 'No se pudo generar la ficha de cuidados PDF.' });
    }
});

app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
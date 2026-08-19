const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const BOARD_MAP = {
  "esp32": "esp32:esp32:esp32",
  "esp32s3": "esp32:esp32:esp32s3",
  "esp32c3": "esp32:esp32:esp32c3",
  "esp32c6": "esp32:esp32:esp32c6"
};

// Todos los builds se crean SIEMPRE dentro de /tmp (único directorio con
// permisos de escritura garantizados en Render). Se expone como constante
// para poder verificarlo en /health y detectar despliegues desincronizados.
const BASE_DIR = '/tmp';

// Tiempo máximo permitido para una compilación antes de abortarla.
const COMPILE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos

// Ruta de diagnóstico: al abrirla en el navegador confirmas al instante
// que Render está corriendo ESTA versión del servidor (y no una anterior
// que usara otra carpeta base, causa típica del error "main file missing").
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    baseDir: BASE_DIR,
    boards: Object.keys(BOARD_MAP),
    uptimeSeconds: Math.round(process.uptime())
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/compile', (req, res) => {
  const { code, board } = req.body || {};

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ success: false, error: "No se recibió código C++." });
  }

  const boardKey = String(board || '').toLowerCase();
  if (board && !BOARD_MAP[boardKey]) {
    return res.status(400).json({
      success: false,
      error: `Placa "${board}" no soportada. Placas válidas: ${Object.keys(BOARD_MAP).join(', ')}`
    });
  }
  const fqbn = BOARD_MAP[boardKey] || BOARD_MAP.esp32c3;

  // Nombre único por build (Date.now() puede repetirse bajo concurrencia).
  const sketchName = `build_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const sessionDir = path.join(BASE_DIR, sketchName);

  const cleanup = () => fs.rm(sessionDir, { recursive: true, force: true }, () => {});

  let responded = false;
  const sendError = (status, error) => {
    if (responded) return;
    responded = true;
    cleanup();
    res.status(status).json({ success: false, error });
  };

  try {
    fs.mkdirSync(sessionDir, { recursive: true });

    // El archivo .ino debe tener el MISMO nombre que la carpeta del sketch.
    const inoPath = path.join(sessionDir, `${sketchName}.ino`);
    fs.writeFileSync(inoPath, code, 'utf8');

    const cmd = `arduino-cli compile --fqbn ${fqbn} --output-dir "${sessionDir}" "${inoPath}"`;

    exec(
      cmd,
      { cwd: sessionDir, timeout: COMPILE_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (responded) return;

        if (error) {
          const detail = stderr || stdout || error.message;
          console.error("Error de compilación:", detail);
          const isTimeout = error.killed && error.signal === 'SIGTERM';
          return sendError(
            isTimeout ? 504 : 400,
            isTimeout ? "La compilación tardó demasiado y fue cancelada." : detail
          );
        }

        const binPath = path.join(sessionDir, `${sketchName}.ino.bin`);

        if (!fs.existsSync(binPath)) {
          return sendError(500, "Archivo .bin no encontrado tras compilar.");
        }

        responded = true;
        res.sendFile(binPath, (sendErr) => {
          if (sendErr) console.error("Error enviando el binario:", sendErr.message);
          cleanup();
        });
      }
    );
  } catch (err) {
    sendError(500, err.message);
  }
});

// Manejo de errores no capturados en middlewares (p.ej. JSON malformado)
app.use((err, req, res, next) => {
  console.error("Error no manejado:", err.message);
  res.status(500).json({ success: false, error: "Error interno del servidor." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT} (BASE_DIR=${BASE_DIR})`));

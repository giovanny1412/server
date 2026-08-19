const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();

// 1. CONFIGURACIÓN COMPLETA Y LIBRE DE CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const BOARD_MAP = {
  "esp32": "esp32:esp32:esp32",
  "esp32s3": "esp32:esp32:esp32s3",
  "s3": "esp32:esp32:esp32s3",
  "esp32c3": "esp32:esp32:esp32c3",
  "c3": "esp32:esp32:esp32c3",
  "esp32c6": "esp32:esp32:esp32c6",
  "c6": "esp32:esp32:esp32c6"
};

// Ruta de prueba para verificar que el servidor responda
app.get('/', (req, res) => {
  res.send("Servidor de compilación activo y listo.");
});

app.post('/compile', (req, res) => {
    const { code, board } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, error: "No se recibió código C++." });
    }

    const fqbn = BOARD_MAP[board] || "esp32:esp32:esp32c3";
    const sketchName = `build_${Date.now()}`;
    const sessionDir = path.join('/tmp', sketchName);

    try {
        fs.mkdirSync(sessionDir, { recursive: true });

        const inoPath = path.join(sessionDir, `${sketchName}.ino`);
        fs.writeFileSync(inoPath, code, 'utf8');

        // Comando ultra-optimizado para Render (limitado a 1 hilo sin sobrecargar la RAM)
        const cmd = `arduino-cli compile --fqbn ${fqbn} --jobs 1 --output-dir "${sessionDir}" "${sketchName}.ino"`;

        exec(cmd, { cwd: sessionDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                console.error("Error de compilación:", stderr || stdout);
                fs.rmSync(sessionDir, { recursive: true, force: true });
                return res.status(400).json({ success: false, error: stderr || stdout });
            }

            const binPath = path.join(sessionDir, `${sketchName}.ino.bin`);

            if (fs.existsSync(binPath)) {
                res.sendFile(binPath, () => {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                });
            } else {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                res.status(500).json({ success: false, error: "El archivo binario no fue generado." });
            }
        });

    } catch (err) {
        console.error("Error general:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));

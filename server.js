const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();

// Configuración de CORS permisivo para GitHub Pages o cualquier cliente web
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Mapeo completo de nombres de placas (soporta alias cortos y largos)
const BOARD_MAP = {
  "esp32": "esp32:esp32:esp32",
  "esp32s3": "esp32:esp32:esp32s3",
  "s3": "esp32:esp32:esp32s3",
  "esp32c3": "esp32:esp32:esp32c3",
  "c3": "esp32:esp32:esp32c3",
  "esp32c6": "esp32:esp32:esp32c6",
  "c6": "esp32:esp32:esp32c6"
};

// Ruta raíz de comprobación de estado
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
        // 1. Crear carpeta temporal en /tmp
        fs.mkdirSync(sessionDir, { recursive: true });

        // 2. Crear archivo .ino con el mismo nombre exacto de la carpeta
        const inoPath = path.join(sessionDir, `${sketchName}.ino`);
        fs.writeFileSync(inoPath, code, 'utf8');

        // 3. Comando con --jobs 1 para no saturar la memoria RAM en Render
        const cmd = `arduino-cli compile --fqbn ${fqbn} --jobs 1 --output-dir "${sessionDir}" "${sketchName}.ino"`;

        // 4. Ejecutar usando { cwd: sessionDir } para evitar errores de directorio de trabajo
        exec(cmd, { cwd: sessionDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                console.error("Error de compilación:", stderr || stdout);
                fs.rmSync(sessionDir, { recursive: true, force: true });
                return res.status(400).json({ success: false, error: stderr || stdout });
            }

            const binPath = path.join(sessionDir, `${sketchName}.ino.bin`);

            // 5. Enviar archivo binario y limpiar la carpeta al finalizar
            if (fs.existsSync(binPath)) {
                res.sendFile(binPath, () => {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                });
            } else {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                res.status(500).json({ success: false, error: "Archivo .bin no encontrado tras compilar." });
            }
        });

    } catch (err) {
        console.error("Error general:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));

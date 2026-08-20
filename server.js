const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();

// Variable de estado (candado/semáforo) para evitar OOM por cargas simultáneas en Render
let isCompiling = false;

// Configuración de CORS permisivo
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Mapeo completo de nombres de placas
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
    // 1. Control de concurrencia para evitar saturación de RAM (512MB)
    if (isCompiling) {
        return res.status(503).json({ 
            success: false, 
            error: "El servidor ya está procesando una compilación. Por favor espera unos segundos e intentalo de nuevo." 
        });
    }

    const { code, board } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, error: "No se recibió código C++." });
    }

    isCompiling = true; // Activar candado

    const fqbn = BOARD_MAP[board] || "esp32:esp32:esp32c3";
    const sketchName = `build_${Date.now()}`;
    const sessionDir = path.join('/tmp', sketchName);

    try {
        // 2. Crear carpeta temporal en /tmp
        fs.mkdirSync(sessionDir, { recursive: true });

        // 3. Crear archivo .ino
        const inoPath = path.join(sessionDir, `${sketchName}.ino`);
        fs.writeFileSync(inoPath, code, 'utf8');

        // 4. Comando de compilación optimizado
        const cmd = `arduino-cli compile --fqbn ${fqbn} --jobs 1 --output-dir "${sessionDir}" "${sketchName}.ino"`;

        // 5. Ejecución del compilador
        exec(cmd, { cwd: sessionDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            isCompiling = false; // Liberar candado al finalizar proceso

            if (error) {
                console.error("Error de compilación:", stderr || stdout);
                fs.rmSync(sessionDir, { recursive: true, force: true });
                return res.status(400).json({ success: false, error: stderr || stdout });
            }

            const appPath = path.join(sessionDir, `${sketchName}.ino.bin`);
            const bootloaderPath = path.join(sessionDir, `${sketchName}.ino.bootloader.bin`);
            const partitionsPath = path.join(sessionDir, `${sketchName}.ino.partitions.bin`);
            const bootApp0Path = path.join(sessionDir, `boot_app0.bin`);

            if (!fs.existsSync(appPath)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                return res.status(500).json({ success: false, error: "Archivo .bin principal no encontrado tras compilar." });
            }

            try {
                // 6. Leer binarios y empaquetar en Base64 para retornarlos juntos
                const files = [];

                files.push({
                    type: 'app',
                    data: fs.readFileSync(appPath).toString('base64')
                });

                if (fs.existsSync(bootloaderPath)) {
                    files.push({
                        type: 'bootloader',
                        data: fs.readFileSync(bootloaderPath).toString('base64')
                    });
                }

                if (fs.existsSync(partitionsPath)) {
                    files.push({
                        type: 'partitions',
                        data: fs.readFileSync(partitionsPath).toString('base64')
                    });
                }

                if (fs.existsSync(bootApp0Path)) {
                    files.push({
                        type: 'boot_app0',
                        data: fs.readFileSync(bootApp0Path).toString('base64')
                    });
                }

                // Limpiar archivos temporales de disco
                fs.rmSync(sessionDir, { recursive: true, force: true });

                // Retornar JSON completo
                return res.json({
                    success: true,
                    files: files
                });

            } catch (fsError) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                return res.status(500).json({ success: false, error: "Error procesando los archivos binarios: " + fsError.message });
            }
        });

    } catch (err) {
        isCompiling = false; // Liberar candado si falla antes del exec
        console.error("Error general:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const BOARD_MAP = {
  "esp32": "esp32:esp32:esp32",
  "esp32s3": "esp32:esp32:esp32s3",
  "esp32c3": "esp32:esp32:esp32c3",
  "esp32c6": "esp32:esp32:esp32c6"
};

app.post('/compile', (req, res) => {
    const { code, board } = req.body;

    // Validación de entrada
    if (!code) {
        return res.status(400).json({ success: false, error: "No se recibió código C++ para compilar." });
    }

    const fqbn = BOARD_MAP[board] || "esp32:esp32:esp32c3";
    const sketchName = `build_${Date.now()}`;
    const sessionDir = path.join(__dirname, 'builds', sketchName);

    try {
        // 1. Crear carpeta
        fs.mkdirSync(sessionDir, { recursive: true });

        // 2. Ruta exacta del archivo .ino
        const inoPath = path.join(sessionDir, `${sketchName}.ino`);

        // 3. Escribir archivo de forma sincrónica garantizada
        fs.writeFileSync(inoPath, code, 'utf8');

        // 4. Ejecutar compilación pasando la ruta exacta del archivo .ino
        const cmd = `arduino-cli compile --fqbn ${fqbn} --output-dir "${sessionDir}" "${inoPath}"`;

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error("Error de compilación:", stderr || stdout);
                // Limpiar en caso de fallo
                fs.rmSync(sessionDir, { recursive: true, force: true });
                return res.status(400).json({ success: false, error: stderr || stdout });
            }

            const binPath = path.join(sessionDir, `${sketchName}.ino.bin`);

            if (fs.existsSync(binPath)) {
                res.sendFile(binPath, () => {
                    // Borrar temporales tras la descarga exitosa
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                });
            } else {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                res.status(500).json({ success: false, error: "El binario no se generó correctamente." });
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));

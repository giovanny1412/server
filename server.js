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

    if (!code) {
        return res.status(400).json({ success: false, error: "No se recibió código C++." });
    }

    const fqbn = BOARD_MAP[board] || "esp32:esp32:esp32c3";
    const sketchName = `build_${Date.now()}`;
    
    // Crear la carpeta dentro de /tmp para evitar problemas de permisos en Render
    const sessionDir = path.join('/tmp', sketchName);

    try {
        fs.mkdirSync(sessionDir, { recursive: true });

        // Archivo .ino con el MISMO NOMBRE de la carpeta
        const inoPath = path.join(sessionDir, `${sketchName}.ino`);
        fs.writeFileSync(inoPath, code, 'utf8');

        // LA CLAVE: Nos movemos (cd) a la carpeta del proyecto antes de compilar
        const cmd = `cd "${sessionDir}" && arduino-cli compile --fqbn ${fqbn} --output-dir "${sessionDir}" "${sketchName}.ino"`;

        exec(cmd, (error, stdout, stderr) => {
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
                res.status(500).json({ success: false, error: "Archivo .bin no encontrado." });
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));

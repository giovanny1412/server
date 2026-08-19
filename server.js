const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Mapa de placas válidas para evitar ejecución de comandos no deseados
const BOARD_MAP = {
  "esp32": "esp32:esp32:esp32",
  "esp32s3": "esp32:esp32:esp32s3",
  "esp32c3": "esp32:esp32:esp32c3",
  "esp32c6": "esp32:esp32:esp32c6"
};

app.post('/compile', (req, res) => {
    const { code, board } = req.body;
    
    // Obtener el FQBN correcto según lo enviado por el usuario (por defecto ESP32 normal)
    const fqbn = BOARD_MAP[board] || "esp32:esp32:esp32";

    const sketchName = `build_${Date.now()}`;
    const sessionDir = path.join(__dirname, 'builds', sketchName);
    
    fs.mkdirSync(sessionDir, { recursive: true });
    
    const inoPath = path.join(sessionDir, `${sketchName}.ino`);
    fs.writeFileSync(inoPath, code);

    // Usa el FQBN dinámico correspondiente a la placa seleccionada
    const cmd = `arduino-cli compile --fqbn ${fqbn} --output-dir "${sessionDir}" "${sessionDir}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error("Error de compilación:", stderr);
            return res.status(400).json({ success: false, error: stderr || stdout });
        }

        const binPath = path.join(sessionDir, `${sketchName}.ino.bin`);
        if (fs.existsSync(binPath)) {
            res.sendFile(binPath, () => {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            });
        } else {
            res.status(500).json({ success: false, error: "Archivo .bin no encontrado." });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de compilación corriendo en puerto ${PORT}`));

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Mapa de placas soportadas
const BOARD_MAP = {
  "esp32": "esp32:esp32:esp32",
  "esp32s3": "esp32:esp32:esp32s3",
  "esp32c3": "esp32:esp32:esp32c3",
  "esp32c6": "esp32:esp32:esp32c6"
};

app.post('/compile', (req, res) => {
    const { code, board } = req.body;

    // Selecciona el FQBN dinámico enviado por el cliente (por defecto ESP32-C3)
    const fqbn = BOARD_MAP[board] || "esp32:esp32:esp32c3";

    // Generar un nombre único coincidente para la carpeta y el archivo
    const sketchName = `build_${Date.now()}`;
    const sessionDir = path.join(__dirname, 'builds', sketchName);

    // Crear el directorio
    fs.mkdirSync(sessionDir, { recursive: true });

    // EL FIX: El archivo .ino DEBE tener exactamente el mismo nombre que la carpeta
    const inoPath = path.join(sessionDir, `${sketchName}.ino`);
    fs.writeFileSync(inoPath, code);

    // Comando de compilación usando arduino-cli
    const cmd = `arduino-cli compile --fqbn ${fqbn} --output-dir "${sessionDir}" "${sessionDir}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error("Error durante la compilación:", stderr || stdout);
            return res.status(400).json({ success: false, error: stderr || stdout });
        }

        // El binario generado por arduino-cli tendrá este nombre
        const binPath = path.join(sessionDir, `${sketchName}.ino.bin`);

        if (fs.existsSync(binPath)) {
            res.sendFile(binPath, () => {
                // Limpiar archivos temporales después de enviar
                fs.rmSync(sessionDir, { recursive: true, force: true });
            });
        } else {
            res.status(500).json({ success: false, error: "El archivo binario no fue generado." });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de compilación activo en puerto ${PORT}`));

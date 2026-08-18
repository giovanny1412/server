const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/compile', (req, res) => {
    const { code } = req.body;
    
    // Crear carpeta temporal única para la sesión
    const sessionDir = path.join(__dirname, 'builds', `build_${Date.now()}`);
    fs.mkdirSync(sessionDir, { recursive: true });
    
    // Guardar el código C++ en un archivo .ino
    const inoPath = path.join(sessionDir, 'sketch.ino');
    fs.writeFileSync(inoPath, code);

    // Comando de compilación con arduino-cli
    const cmd = `arduino-cli compile --fqbn esp32:esp32:esp32 --output-dir "${sessionDir}" "${sessionDir}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error("Error de compilación:", stderr);
            return res.status(400).json({ success: false, error: stderr });
        }

        // Buscar el archivo .bin generado
        const binPath = path.join(sessionDir, 'sketch.ino.bin');
        if (fs.existsSync(binPath)) {
            res.sendFile(binPath, () => {
                // Limpieza de archivos temporales
                fs.rmSync(sessionDir, { recursive: true, force: true });
            });
        } else {
            res.status(500).json({ success: false, error: "Archivo .bin no encontrado." });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de compilación corriendo en puerto ${PORT}`));
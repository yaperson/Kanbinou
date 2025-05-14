const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const STORAGE_FILE = path.join(__dirname, 'kanbinou-backup.secure.json');

// Sauvegarder le fichier chiffré
app.post('/api/save', (req, res) => {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(req.body));
    res.sendStatus(200);
  } catch (err) {
    console.error('Erreur en sauvegardant:', err);
    res.status(500).send('Erreur serveur');
  }
});

// Charger le fichier chiffré
app.get('/api/load', (req, res) => {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      return res.status(404).send('Aucune sauvegarde trouvée');
    }
    const data = fs.readFileSync(STORAGE_FILE);
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch (err) {
    console.error('Erreur en chargeant:', err);
    res.status(500).send('Erreur serveur');
  }
});

// Serveur
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur Kanbinou en ligne : http://localhost:${PORT}`);
});

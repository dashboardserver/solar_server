const express = require('express');
const router = express.Router();
const Station = require('../models/Station');

router.get('/', async (_req, res) => {
    try {
        const stations = await Station.find({}, '-__v').sort({ key: 1 });
        res.json(stations);
    } catch (err) {
        res.status(500).json({ message: err.message || 'Failed to fetch stations' });
    }
});

// PATCH อัปเดต openingDate ตาม key
router.patch('/:key/opening-date', async (req, res) => {
    try {
        const { key } = req.params;
        const { openingDate } = req.body; 

        let dateVal = null;
        if (!openingDate) {
            dateVal = null;                 
        } else {
            const d = new Date(openingDate);
            if (isNaN(d.getTime())) {
                return res.status(400).json({ message: 'Invalid openingDate format' });
            }
            dateVal = d;
        }

        const station = await Station.findOneAndUpdate(
            { key },
            { $set: { key, name: key.toUpperCase(), openingDate: dateVal } },
            { new: true, upsert: true }
        );

        if (!station) return res.status(404).json({ message: 'Station not found' });
        res.json({ message: 'Opening date updated', station });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Failed to update opening date' });
    }
});

module.exports = router;

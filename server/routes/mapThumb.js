const express = require('express');

const router = express.Router();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// GET /api/map-thumb?lat=<lat>&lng=<lng>
router.get('/', (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=13&size=800x450&maptype=satellite&key=${GOOGLE_API_KEY}`;
  res.redirect(url);
});

module.exports = router;

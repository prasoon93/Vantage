const express = require('express');
const fetch = require('node-fetch');

const router = express.Router();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// GET /api/places/photo?query=<search_query>
router.get('/photo', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.photos,places.formattedAddress,places.location',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    const data = await searchRes.json();

    if (data.places?.[0]?.photos?.[0]) {
      const photoName = data.places[0].photos[0].name;
      const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=900&key=${GOOGLE_API_KEY}`;
      res.json({ photoUrl, address: data.places[0].formattedAddress || '' });
    } else {
      res.json({ photoUrl: null, address: '' });
    }
  } catch (err) {
    console.error('Places API error:', err.message);
    res.json({ photoUrl: null, address: '' });
  }
});

module.exports = router;

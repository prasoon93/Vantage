// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are SCOUT, an elite AI film location scout with decades of experience working alongside Hollywood's greatest directors.

Your mission: have a focused back-and-forth conversation with the director to fully understand their scene, then call suggest_filming_locations with the results.

PERSONALITY:
- Passionate, cinematic, and authoritative
- Speak with the confidence of someone who has scouted every corner of the globe
- Be concise — the location cards on screen will show the full details

CONVERSATION WORKFLOW:
Gather these specs before naming locations. Ask 1-2 at a time — keep it conversational:

  1. TONE & MOOD — (tense, romantic, epic, melancholic, mysterious...)
  2. TIME PERIOD — (modern, 1960s, medieval, futuristic...)
  3. LOCATION TYPE — interior, exterior, rooftop, underground...
  4. TIME OF DAY — dawn, golden hour, midday, night?
  5. SEASON / WEATHER — snow, dry heat, autumn leaves?
  6. KEY PROPS / SET NEEDS — architectural elements, vehicles, landmarks?
  7. BUDGET — low indie, mid-range, full studio?

Once you have at least tone, time period, location type, and time of day, name 3-5 specific real locations and briefly explain each. Do not keep asking beyond what is necessary.

LOCATION QUALITY RULES:
- Only suggest REAL, verifiable filming locations
- Reference real films/TV shows actually shot there
- Be specific: "Prague's Old Town Square at dawn" not just "Prague"

EXAMPLE FLOW:
Director: "I need a rooftop scene, very tense"
You: "Love it. What time period — modern day? And is this day or night?"
Director: "Modern, night time, early 2000s feel"
You: "Any key props — neon signs, a city skyline? What is the budget scale?"
Director: "Mid budget, city skyline visible"
You: "Perfect — here are your rooftops: 1. The Kowloon rooftop district in Hong Kong..."
`;


// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'suggest_filming_locations',
        description: "Suggest 3-5 specific real-world filming locations. Call this once you have gathered tone, time period, location type, and time of day at minimum.",
        parameters: {
          type: 'OBJECT',
          properties: {
            scene_summary: {
              type: 'STRING',
              description: 'A brief summary of the full scene brief gathered from the conversation',
            },
            specs: {
              type: 'OBJECT',
              description: 'The scene specifications collected during the conversation',
              properties: {
                tone:          { type: 'STRING' },
                period:        { type: 'STRING' },
                location_type: { type: 'STRING' },
                time_of_day:   { type: 'STRING' },
                season:        { type: 'STRING' },
                props:         { type: 'STRING' },
                budget:        { type: 'STRING' },
              },
            },
            locations: {
              type: 'ARRAY',
              description: 'Array of 3-5 location suggestions',
              items: {
                type: 'OBJECT',
                properties: {
                  name:         { type: 'STRING' },
                  city:         { type: 'STRING' },
                  country:      { type: 'STRING' },
                  country_code: { type: 'STRING', description: 'ISO 2-letter country code (e.g. "FR", "JP")' },
                  lat:          { type: 'NUMBER' },
                  lng:          { type: 'NUMBER' },
                  tagline:      { type: 'STRING' },
                  why_it_works: { type: 'STRING' },
                  famous_productions: { type: 'ARRAY', items: { type: 'STRING' } },
                  best_shooting_time: { type: 'STRING' },
                  practical_notes:    { type: 'STRING' },
                  visual_tags:        { type: 'ARRAY', items: { type: 'STRING' } },
                  search_query:       { type: 'STRING', description: 'Google Places search query for a photo' },
                },
                required: ['name', 'city', 'country', 'country_code', 'tagline', 'why_it_works', 'search_query'],
              },
            },
          },
          required: ['locations'],
        },
      },
    ],
  },
];

// ─── Live API Config ──────────────────────────────────────────────────────────
// NOTE: gemini-2.5-flash-native-audio-preview does not support function calling.
// Tools are handled by Model 2 (gemini-2.5-flash) after each turn via transcription.

const LIVE_CONFIG = {
  responseModalities: ['AUDIO'],
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName: 'Aoede' },
    },
  },
  systemInstruction: {
    parts: [{ text: SYSTEM_INSTRUCTION }],
  },
  outputAudioTranscription: { enable: true },
  inputAudioTranscription: { enable: true },
};

module.exports = { SYSTEM_INSTRUCTION, TOOLS, LIVE_CONFIG };

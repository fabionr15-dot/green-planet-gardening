const ALLOWED_ORIGINS = ['https://greenplanetgardening.eu', 'https://www.greenplanetgardening.eu', 'https://green-planet-gardening.netlify.app', 'http://localhost:4321', 'http://localhost:8888', 'http://localhost:4322', 'http://localhost:4323', 'http://localhost:4324'];

export async function handler(event) {
  // CORS
  const origin = event.headers.origin || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Validate size
  if (event.body.length > 7 * 1024 * 1024) {
    return { statusCode: 413, headers: corsHeaders, body: JSON.stringify({ error: 'File too large' }) };
  }

  try {
    const { image } = JSON.parse(event.body);
    if (!image) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'No image provided' }) };
    }

    // Extract base64 data
    const base64Match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!base64Match) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid image format' }) };
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];

    // Validate mime type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Unsupported image format' }) };
    }

    // Step 1: Send to PlantNet
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([imageBuffer], { type: mimeType });
    const formData = new FormData();
    formData.append('images', blob, `plant.${mimeType.split('/')[1]}`);
    formData.append('organs', 'auto');

    const plantnetRes = await fetch(
      `https://my-api.plantnet.org/v2/identify/all?api-key=${process.env.PLANTNET_API_KEY}`,
      { method: 'POST', body: formData }
    );

    if (!plantnetRes.ok) {
      console.error('PlantNet error:', plantnetRes.status);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Plant identification service unavailable' }) };
    }

    const plantData = await plantnetRes.json();
    const bestMatch = plantData.results?.[0];
    if (!bestMatch) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Could not identify this plant. Try a clearer photo.' }) };
    }

    const plantName = bestMatch.species?.commonNames?.[0] || bestMatch.species?.scientificNameWithoutAuthor || 'Unknown';
    const botanicalName = bestMatch.species?.scientificNameWithoutAuthor || '';
    const confidence = bestMatch.score || 0;

    // Step 2: Get care guide from Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Provide a care guide for ${plantName} (${botanicalName}) specifically for growing in Cyprus. Output ONLY valid JSON with these fields: commonName, botanicalName, family, difficulty (Beginner/Intermediate/Expert), watering (object with summer, winter, tips), light, soil, fertilising, pruning, pests, cyprusTips, bestPlantingTime, companionPlants (array).`
        }],
        system: 'You are a certified Mediterranean garden expert with 20 years of experience in Cyprus. Context: Hot dry summers (35-40C), mild wet winters (10-17C), alkaline rocky soil (pH 7.5-8.5). Output ONLY valid JSON, no markdown.'
      }),
    });

    if (!claudeRes.ok) {
      // Return basic info without care guide
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ commonName: plantName, botanicalName, confidence }),
      };
    }

    const claudeData = await claudeRes.json();
    const careText = claudeData.content?.[0]?.text || '{}';

    let careGuide;
    try {
      careGuide = JSON.parse(careText);
    } catch {
      careGuide = { commonName: plantName, botanicalName };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...careGuide, confidence }),
    };

  } catch (err) {
    console.error('Internal error:', err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Service temporarily unavailable' }) };
  }
}

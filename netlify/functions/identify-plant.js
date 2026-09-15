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

    // PlantNet's commonNames field is crowdsourced free text, not a controlled
    // enum -- sanitize before it is interpolated into the Claude prompt below
    // to close the prompt-injection path (strip prompt-control characters,
    // cap length so a crafted entry can't smuggle a large instruction block).
    const sanitizeForPrompt = (value) => {
      if (typeof value !== 'string') return '';
      return value
        .replace(/[\r\n]+/g, ' ')
        .replace(/["'`{}<>]/g, '')
        .trim()
        .slice(0, 100);
    };

    const plantName = sanitizeForPrompt(bestMatch.species?.commonNames?.[0]) || sanitizeForPrompt(bestMatch.species?.scientificNameWithoutAuthor) || 'Unknown';
    const botanicalName = sanitizeForPrompt(bestMatch.species?.scientificNameWithoutAuthor);
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

    let parsed;
    try {
      parsed = JSON.parse(careText);
    } catch {
      parsed = {};
    }

    // Claude's output is model-generated text, not a trusted internal value --
    // allowlist the expected shape/fields and cap string lengths before this
    // response is forwarded to the browser, instead of spreading whatever
    // the model produced verbatim.
    const asString = (value, maxLen = 2000) => (typeof value === 'string' ? value.slice(0, maxLen) : '');
    const asStringArray = (value, maxItems = 20, maxLen = 200) =>
      Array.isArray(value) ? value.filter((v) => typeof v === 'string').slice(0, maxItems).map((v) => v.slice(0, maxLen)) : [];

    const watering = parsed.watering && typeof parsed.watering === 'object' ? parsed.watering : {};

    const careGuide = {
      commonName: asString(parsed.commonName, 100) || plantName,
      botanicalName: asString(parsed.botanicalName, 100) || botanicalName,
      family: asString(parsed.family, 100),
      difficulty: ['Beginner', 'Intermediate', 'Expert'].includes(parsed.difficulty) ? parsed.difficulty : '',
      watering: {
        summer: asString(watering.summer),
        winter: asString(watering.winter),
        tips: asString(watering.tips),
      },
      light: asString(parsed.light),
      soil: asString(parsed.soil),
      fertilising: asString(parsed.fertilising),
      pruning: asString(parsed.pruning),
      pests: asString(parsed.pests),
      cyprusTips: asString(parsed.cyprusTips),
      bestPlantingTime: asString(parsed.bestPlantingTime, 200),
      companionPlants: asStringArray(parsed.companionPlants),
    };

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

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return json(500, { error: 'missing_deepseek_api_key' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return json(400, { error: 'invalid_json' });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages.slice(-10) : [];
  if (!messages.length) return json(400, { error: 'missing_messages' });

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages,
        temperature: 0.75,
        max_tokens: 900,
        stream: false
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(response.status, {
        error: 'deepseek_request_failed',
        detail: data.error && (data.error.message || data.error.code)
      });
    }

    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return json(200, { content: content || '' });
  } catch (error) {
    return json(502, { error: 'deepseek_unreachable' });
  }
};

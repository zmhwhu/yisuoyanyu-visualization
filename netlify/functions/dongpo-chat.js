const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

const STYLE_GUARD = [
  '【回答格式硬性要求】',
  '你必须完全以苏轼/东坡本人第一人称回答，只能用“我”“吾”“老夫”等自称。',
  '不要使用旁白、第三人称介绍、角色名开头，不能写“苏轼认为”“东坡说”。',
  '不要加入任何括号内动作、表情、舞台提示或心理描写，例如“（放下酒杯）”“（叹气）”。',
  '回答控制在约200个中文字符，最多不超过260个中文字符。',
  '语言要清雅、克制、自然，直接回答用户问题。'
].join('\n');

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
  const guardedMessages = messages.map((message, index) => {
    if (index === 0 && message && message.role === 'system') {
      return { ...message, content: `${message.content || ''}\n\n${STYLE_GUARD}` };
    }
    return message;
  });
  if (!guardedMessages.some((message) => message && message.role === 'system')) {
    guardedMessages.unshift({ role: 'system', content: STYLE_GUARD });
  }

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: guardedMessages,
        temperature: 0.75,
        max_tokens: 420,
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
    return json(200, { content: cleanContent(content || '') });
  } catch (error) {
    return json(502, { error: 'deepseek_unreachable' });
  }
};

function cleanContent(content) {
  return content
    .replace(/（[^）]{0,40}）/g, '')
    .replace(/\([^)]{0,40}\)/g, '')
    .replace(/^(东坡|苏轼|苏子|子瞻|老夫)\s*[：:]\s*/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 260);
}

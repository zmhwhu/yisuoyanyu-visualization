const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const MAX_CHARS = 380;

const STYLE_GUARD = [
  '\u3010\u56de\u7b54\u683c\u5f0f\u786c\u6027\u8981\u6c42\u3011',
  '\u4f60\u5fc5\u987b\u5b8c\u5168\u4ee5\u82cf\u8f7c/\u4e1c\u5761\u672c\u4eba\u7b2c\u4e00\u4eba\u79f0\u56de\u7b54\uff0c\u53ea\u80fd\u7528\u201c\u6211\u201d\u201c\u543e\u201d\u201c\u8001\u592b\u201d\u7b49\u81ea\u79f0\u3002',
  '\u4e0d\u8981\u4f7f\u7528\u65c1\u767d\u3001\u7b2c\u4e09\u4eba\u79f0\u4ecb\u7ecd\u3001\u89d2\u8272\u540d\u5f00\u5934\uff0c\u4e0d\u80fd\u5199\u201c\u82cf\u8f7c\u8ba4\u4e3a\u201d\u201c\u4e1c\u5761\u8bf4\u201d\u3002',
  '\u4e0d\u8981\u52a0\u5165\u4efb\u4f55\u62ec\u53f7\u5185\u52a8\u4f5c\u3001\u8868\u60c5\u3001\u821e\u53f0\u63d0\u793a\u6216\u5fc3\u7406\u63cf\u5199\uff0c\u4f8b\u5982\u201c\uff08\u653e\u4e0b\u9152\u676f\uff09\u201d\u201c\uff08\u53f9\u6c14\uff09\u201d\u3002',
  '\u56de\u7b54\u63a7\u5236\u5728\u7ea6300\u4e2a\u4e2d\u6587\u5b57\u7b26\uff0c\u6700\u591a\u4e0d\u8d85\u8fc7380\u4e2a\u4e2d\u6587\u5b57\u7b26\u3002',
  '\u8bed\u8a00\u8981\u6e05\u96c5\u3001\u514b\u5236\u3001\u81ea\u7136\uff0c\u76f4\u63a5\u56de\u7b54\u7528\u6237\u95ee\u9898\u3002'
].join('\n');

const TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return json(204, {});
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const apiKey = getEnv('DEEPSEEK_API_KEY');
  if (!apiKey) return json(500, { error: 'missing_deepseek_api_key' });

  let payload;
  try {
    payload = await req.json();
  } catch (error) {
    return json(400, { error: 'invalid_json' });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages.slice(-10) : [];
  if (!messages.length) return json(400, { error: 'missing_messages' });

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: getEnv('DEEPSEEK_MODEL') || 'deepseek-chat',
      messages: withStyleGuard(messages),
      temperature: 0.75,
      max_tokens: 650,
      stream: true
    })
  }).catch(() => null);

  if (!response) return json(502, { error: 'deepseek_unreachable' });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    return json(response.status || 502, {
      error: 'deepseek_request_failed',
      detail: data.error && (data.error.message || data.error.code)
    });
  }

  return new Response(toTextStream(response.body), { headers: TEXT_HEADERS });
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function getEnv(name) {
  return globalThis.Netlify && globalThis.Netlify.env
    ? globalThis.Netlify.env.get(name)
    : process.env[name];
}

function withStyleGuard(messages) {
  const guarded = messages.map((message, index) => {
    if (index === 0 && message && message.role === 'system') {
      return { ...message, content: `${message.content || ''}\n\n${STYLE_GUARD}` };
    }
    return message;
  });
  if (!guarded.some((message) => message && message.role === 'system')) {
    guarded.unshift({ role: 'system', content: STYLE_GUARD });
  }
  return guarded;
}

function toTextStream(body) {
  const reader = body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const sanitizer = createSanitizer();
  let sseBuffer = '';

  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          const tail = sanitizer.flush();
          if (tail) controller.enqueue(encoder.encode(tail));
          controller.close();
          return;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const blocks = sseBuffer.split(/\n\n/);
        sseBuffer = blocks.pop() || '';

        let output = '';
        for (const block of blocks) {
          const piece = readSseBlock(block);
          if (piece === '[DONE]') {
            output += sanitizer.flush();
            if (output) controller.enqueue(encoder.encode(output));
            controller.close();
            return;
          }
          if (piece) output += sanitizer.write(piece);
          if (sanitizer.done) {
            if (output) controller.enqueue(encoder.encode(output));
            await reader.cancel().catch(() => {});
            controller.close();
            return;
          }
        }

        if (output) {
          controller.enqueue(encoder.encode(output));
          return;
        }
      }
    },
    cancel() {
      return reader.cancel();
    }
  });
}

function readSseBlock(block) {
  let output = '';
  for (const line of block.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    if (data === '[DONE]') return '[DONE]';
    try {
      const parsed = JSON.parse(data);
      output += parsed.choices?.[0]?.delta?.content || '';
    } catch (error) {
      // Ignore malformed SSE fragments; the next block usually completes them.
    }
  }
  return output;
}

function createSanitizer() {
  let insideParen = '';
  let started = false;
  let startBuffer = '';
  let emitted = 0;

  const sanitize = (content) => {
    let output = '';
    for (const char of content) {
      if (insideParen) {
        if (char === insideParen) insideParen = '';
        continue;
      }
      if (char === '\uff08') {
        insideParen = '\uff09';
        continue;
      }
      if (char === '(') {
        insideParen = ')';
        continue;
      }
      if (emitted >= MAX_CHARS) break;
      output += char;
      emitted += 1;
    }
    return output;
  };

  return {
    get done() {
      return emitted >= MAX_CHARS;
    },
    write(content) {
      if (!started) {
        startBuffer += content;
        if (startBuffer.length < 14 && !/[，。！？\n]/u.test(startBuffer)) return '';
        content = startBuffer.replace(/^(?:\u4e1c\u5761|\u82cf\u8f7c|\u82cf\u5b50|\u5b50\u77bb|\u8001\u592b)\s*[\uff1a:]\s*/u, '');
        startBuffer = '';
        started = true;
      }
      return sanitize(content).replace(/\s{2,}/g, ' ');
    },
    flush() {
      if (started || !startBuffer) return '';
      started = true;
      const content = startBuffer.replace(/^(?:\u4e1c\u5761|\u82cf\u8f7c|\u82cf\u5b50|\u5b50\u77bb|\u8001\u592b)\s*[\uff1a:]\s*/u, '');
      startBuffer = '';
      return sanitize(content).replace(/\s{2,}/g, ' ').trim();
    }
  };
}

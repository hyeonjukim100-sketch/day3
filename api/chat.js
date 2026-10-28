// POST /api/chat  { message: "..." }  →  { answer, steps }
// Claude가 find_spots · get_weather 를 스스로 골라 부르고, 결과를 바탕으로 추천한다.
const { toolDefinitions, runTool } = require("../lib/tools");

const MODEL = "claude-sonnet-5-5";
const MAX_TURNS = 5; // 도구 호출 왕복 상한
const MAX_INPUT = 300;

const SYSTEM = `너는 제주도 여행 추천 도우미다.
- 사용자의 요청에서 지역(동쪽·서쪽·서귀포·제주시)과 실내/야외 선호를 파악한다. 지역이 없으면 제주시 기준으로 하고 그 사실을 말한다.
- 추천 전에 get_weather 로 날씨를 확인하고, find_spots 로 후보를 찾는다. 두 도구는 서로 독립적이라 한 번에 같이 불러도 된다.
- 비가 오거나 강수확률이 높으면 실내 위주로, 맑으면 야외 위주로 추천한다. 사용자가 실내/야외를 정했으면 그 선호를 우선한다.
- 추천은 find_spots 결과에 있는 장소만 쓴다. 목록 밖 장소를 지어내지 않는다.
- 3곳 안팎을 골라, 날씨를 근거로 한 이유를 한두 문장씩 한국어로 짧게 쓴다.`;

async function callClaude(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: toolDefinitions,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 지원합니다." });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "서버에 ANTHROPIC_API_KEY 환경변수가 없습니다." });
  }

  const message = String(req.body?.message ?? "").trim().slice(0, MAX_INPUT);
  if (!message) return res.status(400).json({ error: "message가 비어 있습니다." });

  const messages = [{ role: "user", content: message }];
  const steps = [];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const reply = await callClaude(messages);
      messages.push({ role: "assistant", content: reply.content });

      if (reply.stop_reason !== "tool_use") {
        const answer = reply.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        return res.status(200).json({ answer, steps });
      }

      // 같은 턴의 도구 호출은 동시에 실행
      const calls = reply.content.filter((b) => b.type === "tool_use");
      const results = await Promise.all(
        calls.map(async (c) => {
          const output = await runTool(c.name, c.input);
          steps.push({ tool: c.name, input: c.input, output });
          return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(output) };
        })
      );
      messages.push({ role: "user", content: results });
    }
    res.status(200).json({ answer: "도구 호출이 너무 길어져 중단했습니다. 질문을 더 간단히 해 주세요.", steps });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e), steps });
  }
};

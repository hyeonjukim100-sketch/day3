const fs = require("fs");
const path = require("path");

const AREAS = ["동쪽", "서쪽", "서귀포", "제주시"];
const MAX_RESULTS = 8;

const { spots } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "jeju_spots.json"), "utf8")
);

// Claude에 넘기는 도구 설명
const toolDefinitions = [
  {
    name: "find_spots",
    description:
      "제주도 관광지 목록(jeju_spots.json)에서 지역과 실내/야외 조건에 맞는 장소를 최대 8곳 찾아 " +
      "이름·지역·실내 여부·설명을 돌려준다. " +
      "목록 밖 장소는 없다: 결과에 없는 장소는 추천하거나 지어내지 말고, 결과가 비면 조건에 맞는 장소가 목록에 없다고 답한다. " +
      "운영시간·요금·휴무 정보는 담겨 있지 않다.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: AREAS,
          description: "찾을 지역. 동쪽 · 서쪽 · 서귀포 · 제주시 중 하나.",
        },
        indoor: {
          type: "boolean",
          description: "true면 실내만, false면 야외만. 생략하면 둘 다.",
        },
      },
      required: ["area"],
    },
  },
];

// area는 '동쪽(성산)'처럼 읍면이 괄호로 붙을 수 있어 앞부분으로 비교한다.
function findSpots({ area, indoor } = {}) {
  if (!AREAS.includes(area)) {
    return { error: `area는 ${AREAS.join(" · ")} 중 하나여야 합니다.` };
  }
  const found = spots.filter(
    (s) =>
      s.area.split("(")[0] === area &&
      (typeof indoor !== "boolean" || s.indoor === indoor)
  );
  return {
    total: found.length,
    spots: found.slice(0, MAX_RESULTS).map((s) => ({
      name: s.name,
      area: s.area,
      indoor: s.indoor,
      description: s.type,
    })),
  };
}

const handlers = { find_spots: findSpots };

// 도구 이름과 입력으로 실행
function runTool(name, input) {
  const handler = handlers[name];
  return handler ? handler(input) : { error: `알 수 없는 도구: ${name}` };
}

module.exports = { toolDefinitions, findSpots, runTool };

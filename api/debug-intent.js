function normalizeIntentText(value) {
  return String(value || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9+\s]/g, " ").replace(/\s+/g, " ").trim();
}
function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
  }
  return matrix[a.length][b.length];
}
function tokenSimilar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 4) return false;
  const dist = levenshtein(a, b);
  if (maxLen <= 5) return dist <= 1;
  if (maxLen <= 8) return dist <= 2;
  return dist <= 3;
}
function hasTokenMatch(tokens, dictionary) {
  return dictionary.some(word => tokens.some(token => tokenSimilar(token, normalizeIntentText(word))));
}
export default async function handler(request, response) {
  const message = request.query.q || "i want to talk to someone";
  const q = normalizeIntentText(message);
  const tokens = q.split(" ").filter(Boolean);
  const supportVerbs = ["want","need","talk","speak","connect","chat","contact","call","reach","help","assist","request","nataka","ongea","nisaidie"];
  const humanWords = ["agent","agant","egent","human","person","someone","somebody","admin","support","representative","operator","staff","customer","care","assistant","live","mtu","msaada"];
  const hasHuman = hasTokenMatch(tokens, humanWords);
  const hasVerb = hasTokenMatch(tokens, supportVerbs);
  return response.status(200).json({
    input: message,
    normalized: q,
    tokens,
    hasHuman,
    hasVerb,
    liveIntent: hasHuman && hasVerb,
    expectedIntent: hasHuman && hasVerb ? "human_request" : "unknown/basic"
  });
}

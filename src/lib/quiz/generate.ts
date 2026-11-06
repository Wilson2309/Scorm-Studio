import { extractedDocumentSchema, quizConfigSchema, quizSchema, type ExtractedDocument, type Quiz } from "./schema";

/** @deprecated Development fixture only. Never imported by production generation. */
// Deterministic cloze remains only to exercise legacy package compatibility in tests.
const stop = new Set("para como esta este estos estas desde entre sobre donde cuando porque aunque también mediante hacia hasta tiene tienen puede pueden cada otras otros mismo misma según todos todas entonces durante través forma parte sido será están estar esto ese esa pero una unas unos del las los que por con sin sus son más muy hay fue han ser sea cual cuyo cuya".split(" "));
function words(s: string) {
  return s.match(/\p{L}{5,}/gu)?.filter(w => w.length <= 60 && !stop.has(w.toLowerCase())) ?? [];
}
export function generateQuiz(input: ExtractedDocument, config: unknown): Quiz {
  const doc = extractedDocumentSchema.parse(input);
  const settings = quizConfigSchema.parse(config);
  const sentences = [...new Set(doc.text.split(/(?<=[.!?])\s+|\n+/u).map(s => s.trim()))]
    .filter(s => s.length >= 55 && s.length <= 700);
  const vocabulary = [...new Set(words(doc.text).map(w => w.toLowerCase()))];
  const questions: Quiz["questions"] = [];
  const used = new Set<string>();
  for (const sentence of sentences) {
    const target = words(sentence).sort((a,b) => b.length - a.length).find(w => !used.has(w.toLowerCase()));
    if (!target) continue;
    const distractors = vocabulary.filter(w => !sentence.toLowerCase().includes(w)).slice(0,3);
    if (distractors.length < 3) continue;
    const answer = questions.length % 4;
    const options = [...distractors];
    options.splice(answer, 0, target.toLowerCase());
    used.add(target.toLowerCase());
    questions.push({ id: `q${questions.length+1}`, prompt: `Completa según el documento: ${sentence.replace(target, "________")}`, options, answer, evidence: sentence });
    if (questions.length === settings.count) break;
  }
  if (questions.length < settings.count) throw new Error(`El texto permite ${questions.length} preguntas distintas. Reduce la cantidad (mínimo 3) o utiliza un PDF con más contenido.`);
  return quizSchema.parse({ version: 1, title: settings.title, sourceName: doc.name, generator: "local-cloze-v1", scored: settings.scored, passingScore: 70, questions });
}

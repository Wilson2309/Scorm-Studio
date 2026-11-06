import {z} from "zod";
const duration=z.number().finite().nonnegative().optional();
const metricsSchema=z.object({total_duration:duration,load_duration:duration,prompt_eval_count:duration,prompt_eval_duration:duration,eval_count:duration,eval_duration:duration});
export function parseOllamaMetrics(input:unknown){
  // Ignore absent or invalid individual counters, never fabricate zero timings.
  const record=input&&typeof input==="object"?input as Record<string,unknown>:{};
  const safe=Object.fromEntries(Object.keys(metricsSchema.shape).map(key=>[key,duration.safeParse(record[key]).success?record[key]:undefined]));
  const values=metricsSchema.parse(safe);
  return {...values,promptTokensPerSecond:values.prompt_eval_count!==undefined&&values.prompt_eval_duration?values.prompt_eval_count/(values.prompt_eval_duration/1e9):null,
    generationTokensPerSecond:values.eval_count!==undefined&&values.eval_duration?values.eval_count/(values.eval_duration/1e9):null};
}
export type OllamaMetrics=ReturnType<typeof parseOllamaMetrics>;

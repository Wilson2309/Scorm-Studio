export type ProviderDiagnostic = {
  provider: "OpenRouter" | "OpenAI-compatible" | "Ollama";
  model: string;
  httpStatus: number;
  code: string | number | null;
  responseFormat: "json_object" | "json_schema" | "json";
  providerMessage: string;
  parameterRelated: boolean;
  mentions: {responseFormat:boolean;jsonSchema:boolean;strict:boolean;unsupported:boolean};
};

/** Never return raw provider text: it may echo headers or source content. */
export function safeProviderDiagnostic(status:number,payload:unknown,model:string,format:ProviderDiagnostic["responseFormat"],openrouter=true):ProviderDiagnostic {
  const error=typeof payload==="object"&&payload&&"error" in payload?payload.error:null;
  const object=typeof error==="object"&&error?error as Record<string,unknown>:{};
  const text=JSON.stringify(object).slice(0,32_000);
  const mentions={responseFormat:/response[_ ]format/i.test(text),jsonSchema:/json[_ ]schema/i.test(text),strict:/\bstrict\b/i.test(text),unsupported:/unsupported|not supported|does not support|no endpoints.*parameters/i.test(text)};
  const parameterRelated=mentions.responseFormat||mentions.jsonSchema||mentions.strict||mentions.unsupported;
  const rawCode=object.code;
  const code=typeof rawCode==="number"&&Number.isFinite(rawCode)?rawCode:typeof rawCode==="string"&&/^(?:\d{3}|invalid_request_error|invalid_request|unsupported_parameter|rate_limit_exceeded|provider_unavailable)$/.test(rawCode)?rawCode:null;
  // Candidate model IDs are server configuration, not arbitrary response strings.
  const safeModel=/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:-]+$/.test(model)?model:"configured-model";
  return {provider:openrouter?"OpenRouter":"OpenAI-compatible",model:safeModel,httpStatus:status,code,responseFormat:format,parameterRelated,mentions,
    providerMessage:parameterRelated?"El proveedor informa de parámetros o formato de respuesta no compatibles.":status===429?"Límite de solicitudes o capacidad del proveedor.":status===401||status===403?"El proveedor rechazó la autorización.":"Detalle del proveedor omitido para proteger los datos de la solicitud.",
  };
}

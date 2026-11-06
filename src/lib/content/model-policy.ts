export const PRIMARY_MODEL = "google/gemma-4-26b-a4b-it:free";
export const FALLBACK_MODEL = "google/gemma-4-31b-it:free";
export const FREE_MODELS_BUSY = "Los modelos gratuitos están temporalmente ocupados. Inténtalo nuevamente más tarde.";
export function requiresGemmaJsonMode(model:string) {
  const id=model.replace(/:free$/,"");
  return [PRIMARY_MODEL,FALLBACK_MODEL].some(known=>known.replace(/:free$/,"")===id);
}

// Only provider-declared capacity/availability failures qualify. Never classify
// a local parser, schema, programming, auth or routing-configuration failure here.
export function isRecoverableCapacity(status: number, message = "") {
  if (status === 429) return true;
  if (![502, 503, 529].includes(status)) return false;
  if (/invalid|unauthori[sz]ed|api.?key|authentication|unsupported|not found|routing requirements|no endpoints.*(?:policy|privacy|parameter|routing)|(?:data|privacy)[ _-]?policy|require(?:d)?[_ ]parameters|insufficient|credit|billing|configuration/i.test(message)) return false;
  if (status === 529) return true;
  if (status === 503 && (!message || /service unavailable|temporar|capacity|overload|provider.*(?:busy|unavailable)|model.*(?:down|unavailable)/i.test(message))) return true;
  return /temporar(?:ily|y).*(?:unavailable|down)|capacity|overload|model.*(?:unavailable|down)|provider.*(?:busy|unavailable)/i.test(message);
}

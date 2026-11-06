export const canonical=(s:string)=>s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
export const normalizedSourceText=(s:string)=>s.normalize("NFKC").replace(/\s+/g," ").trim();

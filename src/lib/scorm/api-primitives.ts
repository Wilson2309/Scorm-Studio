/** Shared API discovery/call primitives. Quiz's generated runtime remains byte-identical. */
export const scormAPIPrimitives=String.raw`function find(win){for(let i=0;win&&i<20;i++){try{if(win.API)return win.API;if(win.parent===win)break;win=win.parent;}catch{break;}}return null;}
function call(method,...args){try{return api[method](...args);}catch{return 'false';}}
const ok=value=>String(value)==='true';`;

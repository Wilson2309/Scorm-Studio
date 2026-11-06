function visualFaults(metrics,width){
 const issues=[];
 if(metrics.scrollWidth>width+2)issues.push('Horizontal overflow');
 if(metrics.primary!=='#00549b'||metrics.navy!=='#082b4c')issues.push('Institutional CSS missing/overridden');
 if(!/inter/i.test(metrics.bodyFont))issues.push('Inter not loaded/applied');
 if(metrics.fontErrors)issues.push('Font resource failed');
 if(metrics.clippedHeadings)issues.push('Clipped heading');
 if(metrics.controlProblems?.length)issues.push(...new Set(metrics.controlProblems));
 if(metrics.motifs.some(m=>m.width>270||m.height>180))issues.push('Oversized illustration');
 if(Object.values(metrics.nodes).some(n=>n.width<=0||n.width>width+2))issues.push('Invalid content dimensions');
 if(width>=1280&&metrics.nodes['.creative-workspace-grid']&&metrics.nodes['.creation-companion']&&metrics.nodes['.creative-workspace-grid'].display!=='grid')issues.push('Wizard columns collapsed');
 return issues;
}
function cssFaults(css){return ['.creative-workspace-grid','.activity-motif','--brand-yellow','.pipeline-progress','.activity-type-cards'].filter(s=>!css.includes(s));}
module.exports={visualFaults,cssFaults};

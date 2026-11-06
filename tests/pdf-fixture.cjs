function pdfBytes(text,paddingBytes=0){
  const escape=s=>s.replace(/[\\()]/g,'\\$&');
  const stream='BT /F1 10 Tf 40 780 Td 18 TL '+text.split('\n').map((s,i)=>(i?'T* ':'')+'('+escape(s)+') Tj').join('\n')+' ET'+(paddingBytes?'\n%'+ 'x'.repeat(paddingBytes)+'\n':'');
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 850] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Length '+Buffer.byteLength(stream,'latin1')+' >>\nstream\n'+stream+'\nendstream'];
  let result='%PDF-1.4\n';const offsets=[];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(result,'latin1'));result+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(result,'latin1');result+='xref\n0 6\n0000000000 65535 f \n'+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');result+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(result,'latin1');
}
module.exports={pdfBytes};

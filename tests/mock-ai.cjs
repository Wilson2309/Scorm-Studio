/* eslint-disable @typescript-eslint/no-require-imports */
// Test transport only; production provider factory never imports this file.
const http=require('node:http');
const {analysis,quiz}=require('./content-fixture.cjs');
function createMockAI({replay}={}){
  const requests=[];
  const server=http.createServer(async(request,response)=>{
    try{
      if(request.method==='GET'&&request.url==='/api/tags'){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({models:[{name:'qwen2.5:3b'},{name:'llama3.2:3b'}]}));return;}
      let raw='';for await(const chunk of request)raw+=chunk;
      const body=JSON.parse(raw),prompt=body.messages[1].content;
      let input;
      if(request.url==='/api/chat'){
        const marker=prompt.indexOf('[SOURCE '),context=prompt.slice(0,marker).trim();
        const fragments=[...prompt.slice(marker).matchAll(/\[SOURCE (p\d+-f\d+)\]\n([\s\S]*?)(?=\n\[SOURCE |$)/g)].map(m=>({id:m[1],page:Number(m[1].match(/^p(\d+)/)[1]),text:m[2]}));
        input=marker<0?JSON.parse(prompt):context?{...JSON.parse(context),sources:fragments}: {fragments};
        if(input.slots)input.blueprint={slots:input.slots};
      }else input=JSON.parse(prompt);requests.push({name:body.response_format?.json_schema?.name,size:raw.length});
      let result;
      if(input.slots?.[0]?.answer&&Array.isArray(input.evidence)){
        result={questions:input.slots.map(slot=>{
          const value=slot.answer.toLowerCase();
          const stem=value.includes('mitocondria')?'Una célula necesita energía para sostener sus funciones. ¿Qué estructura debería utilizar para producirla mediante respiración celular?':value.includes('biodiversidad')?'¿Qué característica explica la relación entre variedad de especies y estabilidad de un ecosistema?':'¿Qué proceso permite interpretar la transformación de energía solar en nutrientes en las plantas?';
          const explanation=value.includes('mitocondria')?'Las mitocondrias producen energía mediante la respiración celular, lo que permite sostener las funciones de la célula.':value.includes('biodiversidad')?'La biodiversidad representa la variedad de especies presentes y favorece la estabilidad de los ecosistemas.':'La fotosíntesis transforma la energía solar en nutrientes que sostienen a los organismos vegetales.';
          return {slotId:slot.slotId,stem,explanation};
        })};
      }else if(input.slots?.[0]?.slotId){
        result={questions:input.slots.map((slot,i)=>{
          const source=input.sources.find(f=>f.id===slot.allowedSourceFragmentIds[0]);
          const index=/fotos[ií]ntesis/i.test(source?.text??'')?0:/mitocondria/i.test(source?.text??'')?1:/biodiversidad/i.test(source?.text??'')?2:i%3;
          const original=replay?.quiz.questions.find(q=>q.concept===slot.concept)??quiz.questions[index];
          return {slotId:slot.slotId,concept:slot.concept,cognitiveLevel:slot.cognitiveLevel,questionFamily:slot.questionFamily,stem:original.stem,options:original.options,correctOptionId:original.correctOptionId,explanation:original.explanation,sourceFragmentIds:slot.allowedSourceFragmentIds};
        })};
      }else if(replay){
        if(input.fragments){
          if(input.fragments.some(f=>!replay.document.fragments.some(s=>s.id===f.id&&s.normalizedText===f.text)))throw new Error('Saved source differs');
          result=replay.analysis;
        }else{
          result={questions:input.blueprint.slots.map(slot=>replay.quiz.questions.find(q=>q.id===slot.questionId))};
        }
      }else if(input.fragments){
        const refs=input.fragments.slice(0,3).map(f=>({fragmentId:f.id,page:f.page??Number(f.id.match(/^p(\d+)/)[1]),quote:f.text}));
        const adapt=(item,i)=>({...item,sourceFragmentIds:[refs[i%refs.length].fragmentId],sourceReferences:[refs[i%refs.length]]});
        result={...analysis,sourceFragmentIds:refs.map(r=>r.fragmentId),sourceReferences:refs,keyConcepts:analysis.keyConcepts.map(adapt),learningObjectives:analysis.learningObjectives.map(adapt),sections:analysis.sections.map(adapt),importantFacts:analysis.importantFacts.map(adapt),relationships:[{...analysis.relationships[0],sourceFragmentIds:[refs[2].fragmentId],sourceReferences:[refs[2]]}]};
      }else{
        result={questions:input.blueprint.slots.map((slot,i)=>{
          const original=quiz.questions[Number(slot.conceptId.replace('c',''))-1]??quiz.questions[i];
          const refs=input.analysis.keyConcepts.find(c=>c.id===slot.conceptId).sourceFragmentIds.map(id=>{const source=input.sources.find(f=>f.id===id);return {fragmentId:id,page:source.page??Number(id.match(/^p(\d+)/)[1]),quote:source.text};});
          const quote=refs[0].quote;
          return {...original,id:`q${i+1}`,concept:slot.conceptId,learningObjective:slot.objectiveId,difficulty:slot.difficulty,cognitiveLevel:slot.cognitiveLevel,sourceFragmentIds:refs.map(r=>r.fragmentId),sourceReferences:refs,explanation:'La respuesta se fundamenta en el proceso descrito: '+quote};
        })};
      }
      const content=JSON.stringify(result,(key,value)=>['documentId','sourceReferences','requestedCognitiveLevel','actualCognitiveLevel'].includes(key)?undefined:value);
      if(request.url==='/api/chat'&&body.stream){
        response.writeHead(200,{'Content-Type':'application/x-ndjson'});
        for(let offset=0;offset<content.length;offset+=71)response.write(JSON.stringify({model:body.model,message:{content:content.slice(offset,offset+71)},done:false})+'\n');
        response.end(JSON.stringify({model:body.model,message:{content:''},done:true,done_reason:'stop'})+'\n');return;
      }
      response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify(request.url==='/api/chat'?{model:body.model,message:{role:'assistant',content},done:true,done_reason:'stop'}:{choices:[{finish_reason:'stop',message:{content}}]}));
    }catch{response.writeHead(500);response.end('{}');}
  });
  return {server,requests};
}
module.exports={createMockAI};

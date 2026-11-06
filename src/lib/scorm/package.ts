import { strToU8, zipSync } from "fflate";
import { quizSchema } from "../quiz/schema";
import { quizRuntime, quizStyles } from "./assets";
import { escapeXML, renderQuiz } from "./template";
import { studioQuizSchema } from "../content/schema";
import { validateQuiz } from "../content/quality";
import { learnerRuntime, learnerStyles } from "./learner-assets";

export function packageSCORM(input: unknown) {
  const modern=typeof input==="object"&&input&&"version" in input&&input.version===2;
  const quiz = modern?studioQuizSchema.parse(input):quizSchema.parse(input);
  if(modern){const quality=validateQuiz(quiz);if(!quality.valid)throw new Error(quality.issues.map(i=>i.message).join(" "));}
  const title = escapeXML(quiz.title);
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="SCORM_STUDIO_QUIZ" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG"><organization identifier="ORG"><title>${title}</title><item identifier="ITEM" identifierref="QUIZ"><title>${title}</title>${quiz.scored ? `<adlcp:masteryscore>${quiz.passingScore}</adlcp:masteryscore>` : ''}</item></organization></organizations>
  <resources><resource identifier="QUIZ" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/><file href="runtime.js"/><file href="styles.css"/></resource></resources>
</manifest>`;
  return zipSync({
    "imsmanifest.xml": strToU8(manifest),
    "index.html": strToU8(renderQuiz(quiz)),
    "runtime.js": strToU8(modern?learnerRuntime:quizRuntime),
    "styles.css": strToU8(modern?learnerStyles:quizStyles),
  });
}

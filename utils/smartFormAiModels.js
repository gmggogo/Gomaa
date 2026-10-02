function cleanModel(value){
  return String(value || "").trim();
}

function pushUnique(list,value){
  const model=cleanModel(value);
  if(model && !list.includes(model)) list.push(model);
}

function smartFormAiDetectModels(env=process.env){
  const models=[];
  pushUnique(models, env.SMART_FORMS_GEMINI_MODEL || "gemini-3-flash");
  pushUnique(models, env.SMART_FORMS_GEMINI_FALLBACK_MODEL || "gemini-3-pro");
  return models;
}

function smartFormAiShouldFallback(status){
  return [404,429,500,502,503,504].includes(Number(status));
}

module.exports={
  smartFormAiDetectModels,
  smartFormAiShouldFallback
};

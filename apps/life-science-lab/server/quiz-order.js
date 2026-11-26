function randomFor(seed) {
  let state=2166136261;
  for(const char of String(seed)){state^=char.charCodeAt(0);state=Math.imul(state,16777619);}
  return () => {
    state+=0x6D2B79F5;
    let value=state;
    value=Math.imul(value^(value>>>15),value|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}

function shuffled(values,seed) {
  const result=[...values],random=randomFor(seed);
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}

export function studentQuestionOrder(questions,{shuffleQuestions=false,shuffleChoices=false}={},attemptId='') {
  let ordered=[...questions];
  if(shuffleQuestions){
    const groups=new Map();
    for(const question of ordered){if(!groups.has(question.type))groups.set(question.type,[]);groups.get(question.type).push(question);}
    ordered=[...groups].flatMap(([type,group])=>shuffled(group,attemptId+':questions:'+type));
  }
  return ordered.map((question)=>{
    if(!shuffleChoices || question.type!=='choice')return question;
    const choiceOrder=shuffled(question.choices.map((_,index)=>index),attemptId+':choices:'+question.id);
    return {...question,choices:choiceOrder.map((index)=>question.choices[index]),choiceOrder};
  });
}

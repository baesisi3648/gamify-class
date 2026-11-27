const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const imageIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function renderQuestionPrompt(question) {
  if(!Array.isArray(question.promptParts))return escapeHtml(question.prompt);
  return question.promptParts.map((part)=>{
    if(part.image && imageIdPattern.test(part.image))return `<img class="quiz-prompt-image" src="/api/lab/quiz-image/${part.image}" alt="문제 이미지" loading="lazy">`;
    const classes=[part.underline?'quiz-underlined':'',part.highlight?'quiz-highlighted':''].filter(Boolean).join(' ');
    return `<span${classes?' class="'+classes+'"':''}>${escapeHtml(part.text)}</span>`;
  }).join('');
}

export function collectPromptParts(editor) {
  const parts=[];
  const appendText=(text,style)=>{
    if(!text)return;
    const last=parts.at(-1);
    if(last && !last.image && last.underline===style.underline && last.highlight===style.highlight)last.text+=text;
    else parts.push({text,underline:style.underline,highlight:style.highlight});
  };
  const walk=(node,style)=>{
    if(node.nodeType===Node.TEXT_NODE){appendText(node.nodeValue,style);return;}
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    const name=node.tagName.toLowerCase();
    if(['script','style','svg','iframe'].includes(name))return;
    if(name==='img'){
      const id=node.dataset.quizImageId;
      if(id && imageIdPattern.test(id))parts.push({image:id});
      return;
    }
    if(name==='br'){appendText('\n',style);return;}
    const next={underline:style.underline||name==='u'||node.style.textDecoration.includes('underline'),
      highlight:style.highlight||name==='mark'||!!node.style.backgroundColor};
    if(['div','p'].includes(name) && parts.length && !parts.at(-1).text?.endsWith('\n'))appendText('\n',style);
    for(const child of node.childNodes)walk(child,next);
  };
  for(const child of editor.childNodes)walk(child,{underline:false,highlight:false});
  return parts;
}

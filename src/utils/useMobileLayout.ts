import { useEffect, useState } from 'react';
export function useMobileLayout() {
  const query='(max-width: 1000px), (any-pointer: coarse)';
  const [automaticMobile,setAutomaticMobile]=useState(()=>matchMedia(query).matches);
  useEffect(()=>{const media=matchMedia(query),update=()=>setAutomaticMobile(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{
    const update=()=>{const v=window.visualViewport;document.documentElement.style.setProperty('--visible-height',`${v?.height??window.innerHeight}px`);document.documentElement.style.setProperty('--visible-top',`${v?.offsetTop??0}px`);};
    update();window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);window.addEventListener('resize',update);
    return()=>{window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[]);
  return { mobile: automaticMobile };
}
